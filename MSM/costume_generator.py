import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, unquote

# ANSI Colors for a beautiful terminal output
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_CYAN = '\033[96m'
C_MAGENTA = '\033[95m'
C_RESET = '\033[0m'
C_BOLD = '\033[1m'

def download_msm_costumes():
    print(f"\n{C_BOLD}{C_MAGENTA}=== MSM Costume Downloader ==={C_RESET}\n")
    
    api_url = "https://mysingingmonsters.fandom.com/api.php"
    params = {
        "action": "parse",
        "page": "Costumes",
        "format": "json",
        "disablelimitreport": 1,
        "disableeditsection": 1
    }
    
    headers = {
        'User-Agent': 'MSM-Costume-Archiver/1.0 (Debian Linux; Python Requests)'
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

    print(f"{C_CYAN}[*]{C_RESET} Parsing HTML and searching for costume images...")
    soup = BeautifulSoup(html_content, 'html.parser')
    
    output_dir = 'data/costumes'
    os.makedirs(output_dir, exist_ok=True)
    
    # 2. Build the Download Queue
    download_queue = {}
    
    # Fandom strictly wraps its wiki images in <a> tags with the 'image' class.
    # This safely grabs gallery images, table sprites, and inline costume icons.
    image_links = soup.find_all('a', class_='image')
    
    for a_tag in image_links:
        img_tag = a_tag.find('img')
        if not img_tag:
            continue
            
        # Extract the highest-quality source link (Fandom lazy-loads via data-src)
        img_url = img_tag.get('data-src') or img_tag.get('src')
        if not img_url:
            continue
            
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
            
        # Clean the URL to get the base image (removes downscaling params)
        parsed_url = urlparse(img_url)
        clean_path = parsed_url.path.split('/revision/')[0]
        ext = os.path.splitext(clean_path)[1]
        
        if ext.lower() not in ['.png', '.jpg', '.jpeg', '.gif']:
            continue
            
        # The 'title' tag on the <a> element is extremely reliable in MediaWiki
        # It gives us the exact file name (e.g. "File:Mammott SummerSong Costume.png")
        raw_title = a_tag.get('title', '')
        if raw_title.startswith('File:'):
            costume_name = raw_title.replace('File:', '').replace(ext, '').strip()
        else:
            costume_name = img_tag.get('alt', '').replace(ext, '').strip()
            
        # Fallback to the URL filename if needed
        if not costume_name:
            costume_name = unquote(os.path.basename(clean_path)).replace(ext, '')
            
        if not costume_name or len(costume_name) > 60:
            continue
            
        # Strip illegal Linux OS characters for the physical file
        safe_name = "".join(c for c in costume_name if c.isalnum() or c in " -_()").strip()
        
        if safe_name and safe_name not in download_queue:
            download_queue[safe_name] = {
                'name': costume_name,
                'url': img_url.split('/revision/')[0], # Force highest resolution CDN URL
                'ext': ext
            }

    total_files = len(download_queue)
    if total_files == 0:
        print(f"{C_RED}[!] No costumes found. The HTML structure might have changed.{C_RESET}\n")
        return
        
    print(f"{C_GREEN}[+]{C_RESET} Found {total_files} unique costumes to process.\n")

    # 3. Process the Queue
    stats = {'new': 0, 'skipped': 0, 'failed': 0}
    costume_data_index = {}
    
    for i, (safe_name, data) in enumerate(download_queue.items(), 1):
        file_name = f"{safe_name}{data['ext']}"
        file_path = os.path.join(output_dir, file_name)
        
        # Save the readable name -> relative file path mapping for the API
        costume_data_index[data['name']] = f"costumes/{file_name}" 
        
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
            img_response = requests.get(data['url'], headers=headers)
            if img_response.status_code == 200:
                with open(file_path, 'wb') as f:
                    f.write(img_response.content)
                stats['new'] += 1
            else:
                print(f"\n{C_RED}  [!] HTTP {img_response.status_code} for {data['name']}{C_RESET}")
                stats['failed'] += 1
        except Exception as e:
            print(f"\n{C_RED}  [!] Failed: {data['name']} - {e}{C_RESET}")
            stats['failed'] += 1

    # Clear the processing line
    sys.stdout.write(f"\r{' ' * 60}\r")
    sys.stdout.flush()

    # 4. Save JSON index
    json_path = 'data/costumes_index.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(costume_data_index, f, indent=4, ensure_ascii=False)
        
    # 5. The Recap
    print(f"{C_BOLD}{C_CYAN}┌──────────────────────────────────────────────┐{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│               {C_MAGENTA}SCRIPT FINISHED{C_CYAN}                │{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}├──────────────────────────────────────────────┤{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} Total Costumes Found: {str(total_files).rjust(21)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_GREEN}Newly Downloaded:{C_RESET} {str(stats['new']).rjust(26)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_YELLOW}Already Existed:{C_RESET} {str(stats['skipped']).rjust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_RED}Failed Downloads:{C_RESET} {str(stats['failed']).rjust(26)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}├──────────────────────────────────────────────┤{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_BOLD}Image Directory:{C_RESET} {output_dir.ljust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_BOLD}JSON Index File:{C_RESET} {json_path.ljust(27)} {C_BOLD}{C_CYAN}│{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}└──────────────────────────────────────────────┘{C_RESET}\n")

if __name__ == "__main__":
    download_msm_costumes()
