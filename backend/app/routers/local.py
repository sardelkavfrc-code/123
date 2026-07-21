import asyncio
import hashlib
import logging
import os
import re
import threading
from pathlib import Path
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from tinytag import TinyTag

from ..config import get_settings
from ..models.audio import Track, TrackArtist
from ..utils import local_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/local", tags=["local"])

# --- Models ---
class ScanPayload(BaseModel):
    folders: list[str]
    ignored_paths: list[str] | None = None

class ParsePathsRequest(BaseModel):
    paths: list[str]

class DownloadTrackRequest(BaseModel):
    id: int
    owner_id: int
    title: str
    artist: str
    album_title: str | None = None
    duration: int
    url: str
    cover_medium: str | None = None
    cover_small: str | None = None
    cover_large: str | None = None

class DownloadPayload(BaseModel):
    tracks: list[DownloadTrackRequest]
    target_dir: str | None = None

class DeleteTrackPayload(BaseModel):
    id: int
    delete_file: bool = False

class CancelDownloadPayload(BaseModel):
    id: int
    owner_id: int

# --- Helper Functions ---
def sanitize_filename(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '', name).strip()

def path_to_id(file_path: str) -> int:
    h = hashlib.sha256(file_path.encode('utf-8')).digest()
    return int.from_bytes(h[:4], byteorder='big') & 0x7fffffff

def make_track_model(path: str, title: str, artist: str, album: str, duration: int, has_cover: bool, base_url: str) -> Track:
    track_id = path_to_id(path)
    cover_url = f"{base_url}/api/local/covers/{track_id}.jpg" if has_cover else None
    return Track(
        id=track_id,
        owner_id=-999999,
        title=title,
        artist=artist,
        duration=duration,
        url=f"{base_url}/local/file?path={path}",
        cover_small=cover_url,
        cover_medium=cover_url,
        cover_large=cover_url,
        album_title=album or None,
        main_artists=[TrackArtist(name=artist)]
    )

def convert_ts_to_mp3(ts_files: list[Path], output_mp3: Path):
    import av
    first_ts = next((tf for tf in ts_files if tf.exists()), None)
    if not first_ts:
        raise Exception("No input files to transcode")
        
    with av.open(str(first_ts)) as first_container:
        first_audio = next((s for s in first_container.streams if s.type == "audio"), None)
        if not first_audio:
            raise Exception("No audio stream in first TS file")
            
        rate = first_audio.rate or 44100
        layout = first_audio.layout or "stereo"
        
        with av.open(str(output_mp3), 'w', 'mp3') as out_container:
            out_stream = out_container.add_stream("mp3", rate=rate)
            out_stream.layout = layout
            out_stream.bit_rate = 192000
            
            resampler = av.AudioResampler(
                format=out_stream.codec_context.format,
                layout=out_stream.layout,
                rate=out_stream.rate
            )
            
            for ts_file in ts_files:
                if not ts_file.exists():
                    continue
                try:
                    with av.open(str(ts_file)) as in_container:
                        in_audio = next((s for s in in_container.streams if s.type == "audio"), None)
                        if not in_audio:
                            continue
                        for frame in in_container.decode(in_audio):
                            resampled_frames = resampler.resample(frame)
                            for rf in resampled_frames:
                                for packet in out_stream.encode(rf):
                                    out_container.mux(packet)
                except Exception as e:
                    logger.warning(f"Error decoding {ts_file}: {e}")
                    
            # Flush resampler and encoder
            resampled_frames = resampler.resample(None)
            for rf in resampled_frames:
                for packet in out_stream.encode(rf):
                    out_container.mux(packet)
            for packet in out_stream.encode(None):
                out_container.mux(packet)

async def download_hls_track(m3u8_url: str, output_path: Path, progress_callback=None):
    import re

    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        resp = await client.get(m3u8_url)
        resp.raise_for_status()
        lines = resp.text.splitlines()
        
        segments = []
        current_key_info = None
        key_regex = re.compile(r'#EXT-X-KEY:METHOD=([^,\s]+)(?:,URI="([^"]+)")?(?:,IV=([^,\s]+))?')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                match = key_regex.match(line)
                if match:
                    method = match.group(1)
                    uri = match.group(2)
                    iv_str = match.group(3)
                    
                    if method == "NONE":
                        current_key_info = None
                    elif method == "AES-128":
                        resolved_uri = urljoin(m3u8_url, uri) if uri else None
                        iv_bytes = None
                        if iv_str:
                            iv_hex = iv_str.lower().replace("0x", "")
                            iv_bytes = bytes.fromhex(iv_hex)
                            
                        current_key_info = {
                            'method': method,
                            'uri': resolved_uri,
                            'iv': iv_bytes
                        }
            else:
                segment_url = urljoin(m3u8_url, line)
                segments.append({
                    'url': segment_url,
                    'key_info': current_key_info.copy() if current_key_info else None
                })
                
        if not segments:
            raise Exception("No segments found in m3u8 playlist")
            
        temp_dir = output_path.parent / f"temp_{output_path.stem}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        key_cache = {}
        ts_files = []
        try:
            for idx, seg in enumerate(segments):
                seg_url = seg['url']
                key_info = seg['key_info']
                seg_file = temp_dir / f"seg_{idx}.ts"
                
                seg_data = None
                for attempt in range(3):
                    try:
                        seg_resp = await client.get(seg_url)
                        seg_resp.raise_for_status()
                        seg_data = seg_resp.content
                        break
                    except Exception as e:
                        if attempt == 2:
                            raise e
                        await asyncio.sleep(1.0)
                        
                if seg_data is None:
                    raise Exception(f"Failed to download segment {idx}")
                    
                if key_info and key_info['method'] == "AES-128":
                    resolved_uri = key_info['uri']
                    if resolved_uri and resolved_uri not in key_cache:
                        for attempt in range(3):
                            try:
                                key_resp = await client.get(resolved_uri)
                                key_resp.raise_for_status()
                                key_cache[resolved_uri] = key_resp.content
                                break
                            except Exception as e:
                                if attempt == 2:
                                    raise e
                                await asyncio.sleep(1.0)
                                
                    key_bytes = key_cache.get(resolved_uri)
                    if key_bytes:
                        iv = key_info['iv']
                        if iv is None:
                            iv = idx.to_bytes(16, 'big')
                            
                        cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv))
                        decryptor = cipher.decryptor()
                        seg_data = decryptor.update(seg_data) + decryptor.finalize()
                        
                seg_file.write_bytes(seg_data)
                ts_files.append(seg_file)
                if progress_callback:
                    await progress_callback(idx + 1, len(segments))
            
            # Transcode TS segments to MP3
            convert_ts_to_mp3(ts_files, output_path)
        finally:
            for tf in ts_files:
                try:
                    tf.unlink(missing_ok=True)
                except Exception:
                    pass
            try:
                temp_dir.rmdir()
            except Exception:
                pass

def embed_metadata(file_path: Path, title: str, artist: str, album: str | None = None, cover_bytes: bytes | None = None):
    try:
        from mutagen.id3 import APIC, ID3, TALB, TIT2, TPE1, ID3NoHeaderError
        try:
            tags = ID3(file_path)
        except ID3NoHeaderError:
            tags = ID3()
            
        tags["TIT2"] = TIT2(encoding=3, text=title)
        tags["TPE1"] = TPE1(encoding=3, text=artist)
        if album:
            tags["TALB"] = TALB(encoding=3, text=album)
            
        if cover_bytes:
            tags["APIC"] = APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,
                desc="Cover",
                data=cover_bytes
            )
            
        tags.save(file_path)
    except Exception as e:
        logger.warning(f"Failed to embed metadata in {file_path}: {e}")

# --- Scan State & Worker ---
scan_lock = threading.Lock()
is_scanning = False
scan_result = {"status": "idle", "count": 0, "error": None}

def scan_folders_task(folders: list[str], ignored_paths: list[str] = None):
    global is_scanning, scan_result
    with scan_lock:
        is_scanning = True
        scan_result = {"status": "scanning", "count": 0, "error": None}
        
    try:
        settings = get_settings()
        # Always scan standard downloads folder
        downloads_dir = settings.session_dir / "downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)
        
        all_folders = list(folders)
        if str(downloads_dir.resolve()) not in all_folders:
            all_folders.append(str(downloads_dir.resolve()))
            
        covers_dir = settings.session_dir / "local_covers"
        covers_dir.mkdir(parents=True, exist_ok=True)
        
        scanned_tracks = []
        extensions = {".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac", ".wma"}
        scanned_paths = set()
        
        for folder_str in all_folders:
            folder_path = Path(folder_str)
            if not folder_path.exists() or not folder_path.is_dir():
                continue
                
            for root, _, files in os.walk(folder_path):
                for file in files:
                    file_path = Path(root) / file
                    ext = file_path.suffix.lower()
                    if ext not in extensions:
                        continue
                        
                    abs_path = str(file_path.resolve())
                    if ignored_paths and abs_path in ignored_paths:
                        continue
                    if abs_path in scanned_paths:
                        continue
                    scanned_paths.add(abs_path)
                    
                    try:
                        tag = TinyTag.get(abs_path)
                        track_id = path_to_id(abs_path)
                        
                        has_cover = 0
                        # Extract cover with mutagen for better compatibility
                        try:
                            import mutagen
                            audio = mutagen.File(abs_path)
                            cover_data = None
                            if audio and getattr(audio, 'tags', None):
                                if hasattr(audio.tags, "getall") and audio.tags.getall("APIC"):
                                    cover_data = audio.tags.getall("APIC")[0].data
                                elif hasattr(audio, "pictures") and audio.pictures:
                                    cover_data = audio.pictures[0].data
                                elif "covr" in audio.tags and audio.tags["covr"]:
                                    cover_data = bytes(audio.tags["covr"][0])
                                    
                            if cover_data:
                                cover_path = covers_dir / f"{track_id}.jpg"
                                cover_path.write_bytes(cover_data)
                                has_cover = 1
                        except Exception as e:
                            logger.debug(f"Failed to extract cover for {abs_path}: {e}")
                            
                        scanned_tracks.append({
                            "path": abs_path,
                            "id": track_id,
                            "title": tag.title or file_path.stem,
                            "artist": tag.artist or "Неизвестный исполнитель",
                            "album": tag.album or "Неизвестный альбом",
                            "duration": int(tag.duration) if tag.duration else 0,
                            "has_cover": has_cover
                        })
                    except Exception as e:
                        logger.error(f"Failed to scan local file {abs_path}: {e}")
                        
        if scanned_tracks:
            local_db.add_tracks(scanned_tracks)
            
        with scan_lock:
            scan_result = {"status": "completed", "count": len(scanned_tracks), "error": None}
    except Exception as e:
        logger.error(f"Local library scan failed: {e}")
        with scan_lock:
            scan_result = {"status": "failed", "count": 0, "error": str(e)}
    finally:
        with scan_lock:
            is_scanning = False

# --- Download Queue Manager ---
class DownloadItem:
    def __init__(self, track_id: int, owner_id: int, title: str, artist: str, album_title: str | None, duration: int, url: str, cover_url: str | None, target_dir: str | None = None):
        self.track_id = track_id
        self.owner_id = owner_id
        self.title = title
        self.artist = artist
        self.album_title = album_title or ""
        self.duration = duration
        self.url = url
        self.cover_url = cover_url
        self.target_dir = target_dir
        self.status = "pending"
        self.progress = 0
        self.error = None
        self.cancelled = False

class DownloadManager:
    def __init__(self):
        self.queue: list[DownloadItem] = []
        self.lock = threading.Lock()
        self.thread = None
        
    def add_tracks(self, tracks: list[DownloadTrackRequest], target_dir: str | None = None):
        with self.lock:
            self.queue = [item for item in self.queue if item.status in ("pending", "downloading")]
            for t in tracks:
                exists = any(item.track_id == t.id and item.owner_id == t.owner_id for item in self.queue)
                if exists:
                    continue
                item = DownloadItem(
                    track_id=t.id,
                    owner_id=t.owner_id,
                    title=t.title,
                    artist=t.artist,
                    album_title=t.album_title,
                    duration=t.duration,
                    url=t.url,
                    cover_url=t.cover_medium or t.cover_small or t.cover_large,
                    target_dir=target_dir
                )
                self.queue.append(item)
            
            if not self.thread or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._run_loop, daemon=True)
                self.thread.start()
                
    def get_queue(self) -> list[dict]:
        with self.lock:
            return [
                {
                    "id": item.track_id,
                    "owner_id": item.owner_id,
                    "title": item.title,
                    "artist": item.artist,
                    "status": item.status,
                    "progress": item.progress,
                    "error": item.error
                }
                for item in self.queue
            ]
            
    def cancel_download(self, track_id: int, owner_id: int):
        with self.lock:
            for item in self.queue:
                if item.track_id == track_id and item.owner_id == owner_id:
                    if item.status == "pending":
                        item.status = "failed"
                        item.error = "Отменено пользователем"
                    elif item.status == "downloading":
                        item.cancelled = True
                        
    def _run_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._process_queue())
        
    async def _process_queue(self):
        while True:
            item = None
            with self.lock:
                for q_item in self.queue:
                    if q_item.status == "pending":
                        item = q_item
                        break
                if not item:
                    break
                item.status = "downloading"
                
            try:
                await self._download_item(item)
                item.status = "completed"
                item.progress = 100
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                logger.error(f"Download failed for {item.title}: {e}\n{error_trace}")
                print(f"[DOWNLOAD ERROR] {item.title}: {e}\n{error_trace}", flush=True)
                item.status = "failed"
                item.error = str(e)
                
    async def _download_item(self, item: DownloadItem):
        # Refresh stream URL in case it has expired or is missing
        from app import storage
        from app.vk.client import VKClient
        session = storage.load()
        if session and session.access_token:
            try:
                vk = VKClient()
                res = await vk.call("audio.getById", session.access_token, audios=f"{item.owner_id}_{item.track_id}")
                if res and isinstance(res, list) and len(res) > 0:
                    fresh_url = res[0].get("url")
                    if fresh_url:
                        item.url = fresh_url
            except Exception as ex:
                import traceback
                logger.warning(f"Failed to refresh URL for {item.title}: {ex}\n{traceback.format_exc()}")
                print(f"[REFRESH URL ERROR] {item.title}: {ex}\n{traceback.format_exc()}", flush=True)

        settings = get_settings()
        if item.target_dir and os.path.exists(item.target_dir):
            downloads_dir = Path(item.target_dir)
            if downloads_dir.resolve() == settings.session_dir.resolve():
                downloads_dir = downloads_dir / "downloads"
        else:
            downloads_dir = settings.session_dir / "downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)
        
        safe_artist = sanitize_filename(item.artist) or "Неизвестный"
        safe_title = sanitize_filename(item.title) or "Без названия"
        
        if not item.url:
            raise Exception("URL для скачивания не найден (попробуйте позже или проверьте доступность трека)")
            
        is_hls = ".m3u8" in item.url
        ext = ".mp3"
        filename = f"{safe_artist} - {safe_title}{ext}"
        output_path = downloads_dir / filename
        
        local_track_id = path_to_id(str(output_path.resolve()))
        has_cover = 0
        cover_bytes = None
        
        # Download cover image
        if item.cover_url:
            covers_dir = settings.session_dir / "local_covers"
            covers_dir.mkdir(parents=True, exist_ok=True)
            cover_path = covers_dir / f"{local_track_id}.jpg"
            try:
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    resp = await client.get(item.cover_url)
                    if resp.status_code == 200:
                        cover_bytes = resp.content
                        cover_path.write_bytes(cover_bytes)
                        has_cover = 1
            except Exception as e:
                logger.warning(f"Failed to download cover: {e}")
                
        async def progress_cb(current, total):
            if item.cancelled:
                raise Exception("Отменено пользователем")
            item.progress = int((current / total) * 90)
            
        if is_hls:
            await download_hls_track(item.url, output_path, progress_cb)
        else:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                async with client.stream("GET", item.url) as response:
                    response.raise_for_status()
                    total_bytes = int(response.headers.get("content-length", 0))
                    downloaded_bytes = 0
                    with open(output_path, "wb") as f:
                        async for chunk in response.aiter_bytes():
                            if item.cancelled:
                                raise Exception("Отменено пользователем")
                            f.write(chunk)
                            downloaded_bytes += len(chunk)
                            if total_bytes > 0:
                                item.progress = int((downloaded_bytes / total_bytes) * 90)

        # Embed ID3 metadata into saved file
        embed_metadata(output_path, item.title, item.artist, item.album_title, cover_bytes)
                                
        # Add to local DB
        local_db.init_db()
        local_db.add_tracks([{
            "path": str(output_path.resolve()),
            "id": local_track_id,
            "title": item.title,
            "artist": item.artist,
            "album": item.album_title,
            "duration": item.duration,
            "has_cover": has_cover
        }])

download_manager = DownloadManager()

# --- Endpoint Handlers ---
class LogErrorPayload(BaseModel):
    message: str
    stack: str | None = None

@router.post("/log_error")
async def log_frontend_error(payload: LogErrorPayload):
    logger.error(f"[FRONTEND ERROR] {payload.message}\nStack: {payload.stack}")
    print(f"\n[FRONTEND ERROR] {payload.message}\nStack: {payload.stack}\n", flush=True)
    return {"ok": True}

@router.get("/tracks", response_model=list[Track])
async def get_tracks(request: Request):
    base_url = str(request.base_url).rstrip("/")
    tracks_data = local_db.get_all_tracks()
    return [
        make_track_model(
            t["path"], t["title"], t["artist"], t["album"], t["duration"], bool(t["has_cover"]), base_url
        )
        for t in tracks_data
    ]

@router.post("/scan")
async def start_scan(payload: ScanPayload, background_tasks: BackgroundTasks):
    background_tasks.add_task(scan_folders_task, payload.folders, payload.ignored_paths)
    return {"status": "scanning"}

@router.get("/scan/status")
async def get_scan_status():
    global is_scanning, scan_result
    with scan_lock:
        return {
            "is_scanning": is_scanning,
            **scan_result
        }

@router.get("/file")
async def stream_file(path: str, request: Request):
    logger.info(f"stream_file: received path={repr(path)}")
    if not os.path.exists(path):
        logger.error(f"stream_file: file does not exist: {repr(path)}")
        raise HTTPException(status_code=404, detail="Файл не найден")
        
    file_size = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower()
    
    mime_types = {
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".flac": "audio/flac",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".aac": "audio/aac",
    }
    content_type = mime_types.get(ext, "application/octet-stream")
    
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": content_type,
    }
    
    range_header = request.headers.get("Range")
    if range_header:
        try:
            range_val = range_header.replace("bytes=", "").strip()
            parts = range_val.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            if end >= file_size:
                end = file_size - 1
            if start > end:
                start = end
        except Exception as e:
            raise HTTPException(status_code=400, detail="Неверный заголовок Range") from e
            
        content_length = end - start + 1
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(content_length)
        
        def chunk_generator():
            chunk_size = 128 * 1024
            with open(path, "rb") as f:
                f.seek(start)
                bytes_to_read = content_length
                while bytes_to_read > 0:
                    read_size = min(chunk_size, bytes_to_read)
                    data = f.read(read_size)
                    if not data:
                        break
                    bytes_to_read -= len(data)
                    yield data
                    
        return StreamingResponse(
            chunk_generator(),
            status_code=206,
            headers=headers
        )
    else:
        headers["Content-Length"] = str(file_size)
        def chunk_generator():
            chunk_size = 128 * 1024
            with open(path, "rb") as f:
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data
                    
        return StreamingResponse(
            chunk_generator(),
            status_code=200,
            headers=headers
        )

@router.post("/parse_paths", response_model=list[Track])
async def parse_paths_endpoint(payload: ParsePathsRequest, request: Request):
    base_url = str(request.base_url).rstrip("/")
    settings = get_settings()
    covers_dir = settings.session_dir / "local_covers"
    covers_dir.mkdir(parents=True, exist_ok=True)
    
    tracks = []
    extensions = {".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac", ".wma"}
    
    for p in payload.paths:
        path_obj = Path(p)
        if not path_obj.exists():
            continue
            
        # Collect paths to parse
        paths_to_parse = []
        if path_obj.is_dir():
            for root, _, files in os.walk(path_obj):
                for file in files:
                    file_path = Path(root) / file
                    if file_path.suffix.lower() in extensions:
                        paths_to_parse.append(file_path.resolve())
        else:
            if path_obj.suffix.lower() in extensions:
                paths_to_parse.append(path_obj.resolve())
                
        for file_path in paths_to_parse:
            abs_path = str(file_path)
            try:
                tag = TinyTag.get(abs_path, image=True)
                track_id = path_to_id(abs_path)
                
                has_cover = 0
                cover_img = tag.images.any
                if cover_img and cover_img.data:
                    cover_path = covers_dir / f"{track_id}.jpg"
                    cover_path.write_bytes(cover_img.data)
                    has_cover = 1
                    
                title = tag.title or file_path.stem
                artist = tag.artist or "Неизвестный исполнитель"
                album = tag.album or "Неизвестный альбом"
                duration = int(tag.duration) if tag.duration else 0
                
                track_data = {
                    "path": abs_path,
                    "id": track_id,
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "duration": duration,
                    "has_cover": has_cover
                }
                
                local_db.add_tracks([track_data])
                tracks.append(make_track_model(abs_path, title, artist, album, duration, bool(has_cover), base_url))
            except Exception as e:
                logger.error(f"Failed to parse path {abs_path}: {e}")
                
    return tracks

@router.post("/download")
async def start_download(payload: DownloadPayload):
    download_manager.add_tracks(payload.tracks, payload.target_dir)
    return {"status": "started"}

@router.post("/track/delete")
async def delete_track_endpoint(payload: DeleteTrackPayload):
    track = local_db.get_track_by_id(payload.id)
    if track:
        if payload.delete_file:
            path = track.get("path")
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    logger.error(f"Failed to delete file {path}: {e}")
        local_db.delete_track(payload.id)
    return {"status": "ok"}

@router.get("/download/queue")
async def get_download_queue():
    return download_manager.get_queue()

@router.post("/download/cancel")
async def cancel_download_endpoint(payload: CancelDownloadPayload):
    download_manager.cancel_download(payload.id, payload.owner_id)
    return {"status": "ok"}
