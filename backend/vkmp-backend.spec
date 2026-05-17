# PyInstaller spec for the bundled backend binary.
# Produces a single-file executable that Electron spawns at runtime.

# ruff: noqa
# pyinstaller injects globals like Analysis/PYZ/EXE — these are not real
# imports, so we disable the unresolved-name lint here.

from PyInstaller.utils.hooks import collect_submodules

hidden = []
for pkg in (
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
):
    hidden.extend(collect_submodules(pkg))
hidden.extend([
    "anyio._backends._asyncio",
    "httpcore",
    "httpcore._async",
    "httpx",
    "orjson",
    "pydantic.deprecated.decorator",
])

a = Analysis(
    ["app/standalone.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "PIL", "PyQt5", "PySide6", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=None)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="vkmp-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
