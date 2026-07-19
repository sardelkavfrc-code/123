
# -*- coding: utf-8 -*-
import sys
try:
    import asyncio
    from app import storage
    from app.vk.client import VKClient

    async def test():
        session = storage.load()
        vk = VKClient()
        
        try:
            catalog = await vk.call('catalog.getAudio', session.access_token)
            sections = catalog.get('catalog', {}).get('sections', [])
            
            my_music_sec_id = None
            for sec in sections:
                if sec.get('title') == '\u041c\u043e\u044f \u043c\u0443\u0437\u044b\u043a\u0430':
                    my_music_sec_id = sec.get('id')
                    break
                    
            if not my_music_sec_id:
                my_music_sec_id = 'PUldVA8FR0RzSVNUWE1JSmRSS0wEGEleZFFcRA0NWVd2U1oL'
                
            section_data = await vk.call(
                'catalog.getSection',
                session.access_token,
                section_id=my_music_sec_id,
                need_blocks=1,
            )
            
            response_obj = section_data.get('section', {})
            blocks = response_obj.get('blocks', [])
            
            for b in blocks:
                if b.get('data_type') == 'music_audios':
                    title_val = b.get('title') or ''
                    layout_title = (b.get('layout') or {}).get('title') or ''
                    url_val = b.get('url') or ''
                    
                    is_recent = False
                    if 'block=recent' in url_val or title_val == '\u041d\u0435\u0434\u0430\u0432\u043d\u043e \u043f\u0440\u043e\u0441\u043b\u0443\u0448\u0430\u043d\u043d\u044b\u0435' or layout_title == '\u041d\u0435\u0434\u0430\u0432\u043d\u043e \u043f\u0440\u043e\u0441\u043b\u0443\u0448\u0430\u043d\u043d\u044b\u0435':
                        is_recent = True
                        
                    if is_recent:
                        print('Found Recent Block!')
                        audios_ids = b.get('audios_ids') or []
                        print('Recent Audio IDs:', audios_ids[:5])
                        return
                        
            print('No Recent Block found!')
            print('Available blocks:')
            for b in blocks:
                print(' -', b.get('data_type'), b.get('title'), b.get('layout', {}).get('title'), b.get('url'))
                
        except Exception as e:
            print('Error:', e)
            
    asyncio.run(test())
except Exception as e:
    print('GLOBAL ERROR:', e)

