import requests
from bs4 import BeautifulSoup
import json
from pathlib import Path

def scrape_and_organize_likes():
    url = "https://mysingingmonsters.fandom.com/wiki/Likes"
    
    # Spoof a standard browser so Fandom doesn't block the request
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    print("1. Fetching the Likes page from the Fandom Wiki...")
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"Failed to fetch page. Status: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Fandom uses 'article-table' for its data tables
    tables = soup.find_all('table', class_='article-table')
    print(f" -> Found {len(tables)} tables to parse.")

    structured_data = {}
    raw_likes_count = 0

    print("2. Parsing monster likes...")
    for table in tables:
        rows = table.find_all('tr')
        
        for row in rows:
            cells = row.find_all(['th', 'td'])
            
            # We expect at least 2 cells: [Monster], [Likes]
            if len(cells) < 2:
                continue
                
            monster_cell = cells[0]
            likes_cell = cells[1]

            # --- 1. Extract Monster Name ---
            # Try to get the name from the first link title, fallback to raw text
            monster_link = monster_cell.find('a')
            if monster_link and monster_link.get('title'):
                monster_name = monster_link['title'].strip()
            else:
                monster_name = monster_cell.get_text(strip=True)

            # Skip header rows that just say "Monster"
            if not monster_name or monster_name.lower() == "monster":
                continue

            # --- 2. Extract Likes ---
            likes = []
            
            # Fandom formats likes as links with titles (e.g., <a title="Drumpler">)
            for a_tag in likes_cell.find_all('a'):
                title = a_tag.get('title')
                if not title:
                    continue
                    
                title = title.strip()
                
                # Filter out wiki-specific file links and UI buttons
                if title.startswith("File:") or title.lower() == "expand":
                    continue
                    
                # Prevent duplicates (Fandom often wraps image AND text in identical <a> tags)
                if title not in likes:
                    likes.append(title)
                    
            # Fallback if no <a> tags exist (just in case they use plain text)
            if not likes:
                raw_text = likes_cell.get_text(separator='|', strip=True)
                likes = [item.strip() for item in raw_text.split('|') if item.strip() and item.lower() != "expand"]

            if not likes:
                continue

            # --- 3. Determine Rarity & Clean Name ---
            rarity = "Common"
            clean_name = monster_name
            
            if clean_name.startswith("Rare "):
                rarity = "Rare"
                clean_name = clean_name[5:].strip()
            elif clean_name.startswith("Epic "):
                rarity = "Epic"
                clean_name = clean_name[5:].strip()

            # --- 4. Store in Dictionary ---
            if clean_name not in structured_data:
                structured_data[clean_name] = {"Common": [], "Rare": [], "Epic": []}
                
            # If a monster appears in multiple tables (e.g. different islands), combine them
            existing_likes = structured_data[clean_name][rarity]
            combined_likes = list(dict.fromkeys(existing_likes + likes)) # Deduplicates while preserving order
            structured_data[clean_name][rarity] = combined_likes
            
            raw_likes_count += 1

    # Clean up any empty rarity arrays to keep JSON neat
    for monster in list(structured_data.keys()):
        structured_data[monster] = {k: v for k, v in structured_data[monster].items() if v}
        if not structured_data[monster]:
            del structured_data[monster]

    # --- 5. Save to JSON ---
    output_path = Path("likes.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(structured_data, f, indent=2, sort_keys=True)
        
    print(f"\nSuccess! Processed {raw_likes_count} total entries.")
    print(f"Generated master database for {len(structured_data)} unique monsters -> '{output_path}'.")

if __name__ == "__main__":
    scrape_and_organize_likes()
