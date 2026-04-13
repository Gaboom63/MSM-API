import requests
import time
from pathlib import Path

def fetch_monster_sounds():
    base_url = "https://mysingingmonsters.fandom.com/api.php"
    download_dir = Path("downloaded_sounds")
    download_dir.mkdir(exist_ok=True)
    
    # The categories that hold all the good monster audio tracks
    audio_categories = [
        "Category:Memory_Sounds",
        "Category:Other_Monster_Samples",
        "Category:DoF_Audio",
        "Category:Composer_Audio"
    ]
    
    file_titles = set() # Using a set to automatically prevent duplicate files
    
    print("1. Asking the Fandom API for a list of all audio files...")
    
    for category in audio_categories:
        print(f" -> Scanning {category}...")
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "file",
            "cmlimit": "500",
            "format": "json"
        }
        
        # Loop to handle pagination if a category has more than 500 sounds
        while True:
            response = requests.get(base_url, params=params).json()
            
            if "query" in response and "categorymembers" in response["query"]:
                for member in response["query"]["categorymembers"]:
                    file_titles.add(member["title"])
                    
            if "continue" in response and "cmcontinue" in response["continue"]:
                params["cmcontinue"] = response["continue"]["cmcontinue"]
            else:
                break

    # Convert back to a list so we can chunk it
    file_titles = list(file_titles)
    print(f"\n   -> Found {len(file_titles)} total audio files across all categories!")
    print("2. Resolving direct download links and downloading...")
    
    downloaded_count = 0
    
    # Helper to chunk the list so we can ask for 50 URLs at a time
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
        
        try:
            info_response = requests.get(base_url, params=info_params).json()
            pages = info_response.get("query", {}).get("pages", {})
            
            for page_id, page_data in pages.items():
                if "imageinfo" in page_data:
                    # Get the direct audio URL
                    audio_url = page_data["imageinfo"][0]["url"]
                    
                    # Clean up the filename (Remove "File:" and replace spaces with underscores)
                    filename = page_data["title"].replace("File:", "").replace("/", "_").replace(" ", "_")
                    file_path = download_dir / filename
                    
                    # Skip if we already downloaded it
                    if not file_path.exists():
                        try:
                            # Download the audio file
                            audio_data = requests.get(audio_url).content
                            with open(file_path, "wb") as handler:
                                handler.write(audio_data)
                            print(f"Downloaded: {filename}")
                            downloaded_count += 1
                            
                            # A tiny delay to keep Fandom's servers happy
                            time.sleep(0.1) 
                        except Exception as e:
                            print(f"Failed to download {filename}: {e}")
        except Exception as e:
            print(f"Failed to fetch metadata batch: {e}")

    print(f"\nSuccess! Downloaded {downloaded_count} new sounds into '{download_dir}'.")

if __name__ == "__main__":
    fetch_monster_sounds()