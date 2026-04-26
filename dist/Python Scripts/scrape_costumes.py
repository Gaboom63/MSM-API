import requests
import time
import urllib.parse
from pathlib import Path

def normalize_filename(filename):
    """Cleans up filenames so spaces, underscores, and cases don't ruin the match."""
    # Decode URL strings (changes %20 to space)
    decoded_name = urllib.parse.unquote(filename)
    # Swap underscores for spaces and force lowercase
    return decoded_name.replace("_", " ").lower()

def fetch_costume_images():
    base_url = "https://mysingingmonsters.fandom.com/api.php"
    
    download_dir = Path("downloaded_costumes")
    download_dir.mkdir(exist_ok=True)
    
    existing_dir = Path("costumes")
    existing_filenames = set()
    
    print("0. Scanning existing costumes to prevent re-downloading...")
    if existing_dir.exists() and existing_dir.is_dir():
        for file_path in existing_dir.rglob('*'):
            if file_path.is_file():
                # Add the NORMALIZED filename to our set
                existing_filenames.add(normalize_filename(file_path.name))
                
    print(f"   -> Found {len(existing_filenames)} existing costume files locally!")
    
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": "Category:Costume_Images",
        "cmtype": "file",
        "cmlimit": "500", 
        "format": "json"
    }
    
    file_titles = []
    print("\n1. Asking the Fandom API for a list of all costume files...")
    
    while True:
        response = requests.get(base_url, params=params).json()
        
        if "query" in response and "categorymembers" in response["query"]:
            for member in response["query"]["categorymembers"]:
                file_titles.append(member["title"])
                
        if "continue" in response and "cmcontinue" in response["continue"]:
            params["cmcontinue"] = response["continue"]["cmcontinue"]
        else:
            break
            
    print(f"   -> Found {len(file_titles)} exact costume files on the wiki!")
    print("\n2. Resolving high-resolution download links for missing files...")
    
    downloaded_count = 0
    skipped_count = 0
    
    def chunk_list(lst, n):
        for i in range(0, len(lst), n):
            yield lst[i:i + n]
            
    for chunk in chunk_list(file_titles, 50):
        titles_str = "|".join(chunk)
        info_params = {
            "action": "query",
            "titles": titles_str,
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json"
        }
        
        info_response = requests.get(base_url, params=info_params).json()
        pages = info_response.get("query", {}).get("pages", {})
        
        for page_id, page_data in pages.items():
            if "imageinfo" in page_data:
                img_url = page_data["imageinfo"][0]["url"]
                
                # The filename exactly as the API gives it
                raw_filename = page_data["title"].replace("File:", "").replace("/", "_")
                file_path = download_dir / raw_filename
                
                # Normalize the API filename to check against our local set
                normalized_api_name = normalize_filename(raw_filename)
                
                if normalized_api_name in existing_filenames or file_path.exists():
                    skipped_count += 1
                    continue
                    
                try:
                    img_data = requests.get(img_url).content
                    with open(file_path, "wb") as handler:
                        handler.write(img_data)
                    print(f"Downloaded: {raw_filename}")
                    downloaded_count += 1
                    
                    time.sleep(0.1) 
                except Exception as e:
                    print(f"Failed to download {raw_filename}: {e}")
                        
    print(f"\nSuccess! Downloaded {downloaded_count} new costumes into '{download_dir}'. Skipped {skipped_count} existing files.")

if __name__ == "__main__":
    fetch_costume_images()