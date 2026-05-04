import requests
from bs4 import BeautifulSoup
import json
import re

def scrape_msm_monsters():
    url = "https://mysingingmonsters.fandom.com/wiki/Monsters"
    
    # 1. Fetch the webpage
    print("Fetching webpage...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"Failed to retrieve the page. Status code: {response.status_code}")
        return

    # 2. Parse the HTML
    soup = BeautifulSoup(response.content, 'html.parser')
    monsters_data = []
    
    # 3. Find all tables and iterate through their cells (<td> or <th>)
    tables = soup.find_all('table')
    
    for table in tables:
        cells = table.find_all(['td', 'th'])
        
        for cell in cells:
            # Extract text (monster name)
            text = cell.get_text(separator=" ", strip=True)
            
            # Skip if the cell is empty or belongs to a Rare/Epic/Prismatic variant
            if not text or any(variant in text for variant in ['Epic', 'Rare', 'Prismatic']):
                continue
                
            # Find all images in this cell that have "Element" in their alt text
            # Using regex to catch variations like "Air Element", "Plant element", etc.
            element_imgs = cell.find_all('img', alt=re.compile(r'Element', re.IGNORECASE))
            
            # If the cell has element images, it's a base monster block!
            if element_imgs:
                # The text might have extra garbage attached, so we grab just the first word/phrase
                # based on standard Fandom table formats
                monster_name = text.split(' ')[0] if len(text.split(' ')) == 1 else text
                
                elements = []
                for img in element_imgs:
                    # Clean up the alt text to get just the element name
                    alt_text = img.get('alt', '')
                    element_name = alt_text.replace(' Element', '').replace(' element', '').strip()
                    
                    if element_name and element_name not in elements:
                        elements.append(element_name)
                
                # Check for duplicates before adding
                if not any(m['Name'] == monster_name for m in monsters_data):
                    monsters_data.append({
                        "Name": monster_name,
                        "Element": elements
                    })

    # 4. Output the result to a JSON file
    output_filename = "Elements.json"
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(monsters_data, f, indent=2, ensure_ascii=False)
        
    print(f"Success! Extracted {len(monsters_data)} common monsters into {output_filename}.")

if __name__ == "__main__":
    scrape_msm_monsters()
