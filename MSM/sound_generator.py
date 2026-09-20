import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

# ANSI Colors for a beautiful terminal output
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_CYAN = '\033[96m'
C_MAGENTA = '\033[95m'
C_RESET = '\033[0m'
C_BOLD = '\033[1m'

def download_msm_sounds():
    print(f"\n{C_BOLD}{C_MAGENTA}=== MSM Sound Downloader ==={C_RESET}\n")
    
    api_url = "https://mysingingmonsters.fandom.com/api.php"
    params = {
        "action": "parse",
        "page": "Monster_Sounds",
        "format": "json",
        "disablelimitreport": 1,
        "disableeditsection": 1
    }
    
    headers = {
        'User-Agent': 'MSM-Sound-Archiver/3.1 (Debian Linux; Python Requests)'
    }
    
    # 1. Fetch Data
    print(f"{C_CYAN}[*]{C_RESET} Fetching HTML via Fandom API...")
    try:
        response = requests.get(api_url, params=params, headers=headers)
        response.raise_for_status()
        html_content = response.json()['parse']['text']['*']
    except Exception as e:
        print(f"{C_RED}[!] Failed to fetch data: {e}{C_RESET}")
        return

    print(f"{C_CYAN}[*]{C_RESET} Parsing HTML and searching for audio links...")
    soup = BeautifulSoup(html_content, 'html.parser')
    
    tabs = soup.find_all('div', class_='wds-tab__content')
    msm_container = tabs[0] if tabs else soup
    
    output_dir = 'data/sounds'
    os.makedirs(output_dir, exist_ok=True)
    
    # 2. Build the Download Queue
    tables = msm_container.find_all('table')
    download_queue = {}
    
    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cols = row.find_all(['td', 'th'])
            
            if len(cols) >= 2:
                # 1. Find Monster Name smartly
                monster_name = ""
                # Try finding the first link with actual text (bypasses image links)
                for a_tag in cols[0].find_all('a'):
                    if a_tag.text.strip():
                        monster_name = a_tag.text.strip()
                        break
                
                # Fallback to pure text if no links are present
                if not monster_name:
                    monster_name = cols[0].get_text(strip=True)
                    
                monster_name = monster_name.replace('*', '').strip()
                
                # SAFETY NET: Skip if it grabbed a massive table header or a raw URL
                if not monster_name or len(monster_name) > 40 or "http" in monster_name:
                    continue
                
                # 2. Find Audio Link
                audio_url = None
                for tag in row.find_all(True):
                    for attr in ['src', 'data-file', 'data-src', 'href']:
                        if tag.has_attr(attr):
                            val = tag[attr]
                            val_lower = val.lower()
                            if ('.mp3' in val_lower or '.ogg' in val_lower or '.wav' in val_lower) and '/wiki/file:' not in val_lower:
                                audio_url = val
                                break
                    if audio_url:
                        break
                
                if not audio_url:
                    continue
                    
                if audio_url.startswith('//'):
                    audio_url = 'https:' + audio_url
                    
                parsed_url = urlparse(audio_url)
                clean_path = parsed_url.path.split('/revision/')[0] 
                ext = os.path.splitext(clean_path)[1] or '.ogg'
                
                safe_name = "".join(c for c in monster_name if c.isalnum() or c in " -_()").strip()
                
                if safe_name not in download_queue:
                    download_queue[safe_name] = {
                        'name': monster_name,
                        'url': audio_url,
                        'ext': ext
                    }

    total_files = len(download_queue)
    if total_files == 0:
        print(f"{C_RED}[!] No monsters found. The HTML structure might have changed.{C_RESET}\n")
        return
        
    print(f"{C_GREEN}[+]{C_RESET} Found {total_files} unique monsters to process.\n")

    # 3. Process the Queue
    stats = {'new': 0, 'skipped': 0, 'failed': 0}
    sound_data_index = {}
    
    for i, (safe_name, data) in enumerate(download_queue.items(), 1):
        file_name = f"{safe_name}{data['ext']}"
        file_path = os.path.join(output_dir, file_name)
        
        # Save the cleaner relative path to the JSON dictionary
        sound_data_index[data['name']] = f"sounds/{file_name}" 
        
        # Dynamic terminal line
        display_name = data['name'][:25].ljust(25)
        sys.stdout.write(f"\r{C_YELLOW}[{i}/{total_files}]{C_RESET} Processing: {C_BOLD}{display_name}{C_RESET}")
        sys.stdout.flush()
        
        # Check if already downloaded
        if os.path.exists(file_path):
            stats['skipped'] += 1
            continue
            
        # Download new file
        try:
            audio_response = requests.get(data['url'], headers=headers)
            if audio_response.status_code == 200:
                with open(file_path, 'wb') as f:
                    f.write(audio_response.content)
                stats['new'] += 1
            else:
                print(f"\n{C_RED}  [!] HTTP {audio_response.status_code} for {data['name']}{C_RESET}")
                stats['failed'] += 1
        except Exception as e:
            print(f"\n{C_RED}  [!] Failed: {data['name']} - {e}{C_RESET}")
            stats['failed'] += 1

    # Clear the processing line
    sys.stdout.write(f"\r{' ' * 60}\r")
    sys.stdout.flush()

    # 4. Save JSON index
    json_path = 'data/sounds_index.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(sound_data_index, f, indent=4, ensure_ascii=False)
        
    # 5. The Recap
    print(f"{C_BOLD}{C_CYAN}┌──────────────────────────────────────────────┐{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│               {C_MAGENTA}SCRIPT FINISHED{C_CYAN}                │{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}├──────────────────────────────────────────────┤{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} Total Monsters Found: {str(total_files).rjust(22)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_GREEN}Newly Downloaded:{C_RESET} {str(stats['new']).rjust(26)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_YELLOW}Already Existed:{C_RESET} {str(stats['skipped']).rjust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_RED}Failed Downloads:{C_RESET} {str(stats['failed']).rjust(26)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}├──────────────────────────────────────────────┤{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_BOLD}Audio Directory:{C_RESET} {output_dir.ljust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_BOLD}JSON Index File:{C_RESET} {json_path.ljust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}└──────────────────────────────────────────────┘{C_RESET}\n")

if __name__ == "__main__":
    download_msm_sounds()
