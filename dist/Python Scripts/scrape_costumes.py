import requests
import time
from pathlib import Path

def fetch_costume_images():
    # The base API endpoint for the Fandom wiki
    base_url = "https://mysingingmonsters.fandom.com/api.php"
    download_dir = Path("downloaded_costumes")
    download_dir.mkdir(exist_ok=True)
    
    # 1. Ask the API for a list of every file tagged in the Costume Images category
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": "Category:Costume_Images",
        "cmtype": "file",
        "cmlimit": "500", # Fetch up to 500 at a time
        "format": "json"
    }
    
    file_titles = []
    print("1. Asking the Fandom API for a list of all costume files...")
    
    # Loop to handle pagination (if there are more than 500 images)
    while True:
        response = requests.get(base_url, params=params).json()
        
        if "query" in response and "categorymembers" in response["query"]:
            for member in response["query"]["categorymembers"]:
                file_titles.append(member["title"])
                
        # Check if there is a 'continue' token for the next page of results
        if "continue" in response and "cmcontinue" in response["continue"]:
            params["cmcontinue"] = response["continue"]["cmcontinue"]
        else:
            break
            
    print(f"   -> Found {len(file_titles)} exact costume files!")
    print("2. Resolving high-resolution download links...")
    
    # 2. Get the actual download URLs for those files
    # The API allows querying multiple titles at once, so we batch them in groups of 50
    downloaded_count = 0
    
    # Helper to chunk the list
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
        
        # 3. Download the images
        for page_id, page_data in pages.items():
            if "imageinfo" in page_data:
                # Extract the direct, uncompressed image URL
                img_url = page_data["imageinfo"][0]["url"]
                
                # Clean up the filename (Remove "File:" prefix and any slashes)
                filename = page_data["title"].replace("File:", "").replace("/", "_")
                file_path = download_dir / filename
                
                if not file_path.exists():
                    try:
                        # Download and save the image
                        img_data = requests.get(img_url).content
                        with open(file_path, "wb") as handler:
                            handler.write(img_data)
                        print(f"Downloaded: {filename}")
                        downloaded_count += 1
                        
                        # A tiny delay so we don't get blocked for spamming requests
                        time.sleep(0.1) 
                    except Exception as e:
                        print(f"Failed to download {filename}: {e}")
                        
    print(f"\nSuccess! Downloaded {downloaded_count} new costumes into '{download_dir}'.")

if __name__ == "__main__":
    fetch_costume_images()