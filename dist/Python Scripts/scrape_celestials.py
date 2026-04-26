import json
import re
import requests
from bs4 import BeautifulSoup
from pathlib import Path

def scrape_celestials_web():
    urls = [
        "https://mysingingmonsters.fandom.com/wiki/Celestials",
        "https://mysingingmonsters.fandom.com/wiki/Celestial_Island"
    ]
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    celestial_data = {}

    for url in urls:
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        tables = soup.find_all('table')
        
        target_tables = []
        for table in tables:
            headers_text = " ".join([th.get_text(separator=' ', strip=True).lower() for th in table.find_all(['th', 'td'])])
            if 'inventory' in headers_text:
                target_tables.append(table)

        for target_table in target_tables:
            rows = target_table.find_all('tr')
            
            inv_idx = -1
            cost_idx = -1
            time_idx = -1
            
            for row in rows:
                cells = row.find_all(['th', 'td'])
                headers_list = [c.get_text(strip=True).lower() for c in cells]
                
                if any('inventory' in h for h in headers_list):
                    for idx, h in enumerate(headers_list):
                        if 'inventory' in h:
                            inv_idx = idx
                        if 'cost' in h:
                            cost_idx = idx
                        if 'time limit' in h:
                            time_idx = idx
                    continue
                    
                if inv_idx == -1 or len(cells) <= max(inv_idx, cost_idx):
                    continue
                    
                monster_cell = cells[0]
                name_a = monster_cell.find_all('a')
                if not name_a:
                    continue
                    
                name = name_a[-1].get('title', name_a[-1].get_text(strip=True))
                name = name.replace(' (monster)', '').replace(' (Monster)', '').strip()
                
                if not name or name.lower() in ['celestial', 'celestials', 'young celestials', 'adult celestials', 'monster', 'monsters']:
                    continue
                    
                inventory_cell = cells[inv_idx]
                inventory = {}
                
                elements = inventory_cell.find_all(['a', 'sup', 'b', 'span'])
                current_egg = None
                for el in elements:
                    if el.name == 'a' and el.get('title'):
                        title = el.get('title')
                        if not title.startswith("File:"):
                            clean_title = title.replace("Category:", "").replace(" Monsters", "").strip()
                            flex_keywords = ["Element", "Flex", "Natural", "Fire", "Magical", "Ethereal", "Mythical", "Epic", "Rare", "Seasonal"]
                            if any(k in clean_title for k in flex_keywords) and "Flex" not in clean_title:
                                clean_title = f"{clean_title} Flex Egg"
                            current_egg = clean_title
                    elif current_egg:
                        qty_text = el.get_text(strip=True).replace('x', '').strip()
                        if qty_text.isdigit():
                            inventory[current_egg] = inventory.get(current_egg, 0) + int(qty_text)
                            current_egg = None
                        
                total_eggs = sum(inventory.values())
                
                cost_value = "Unknown"
                if cost_idx != -1 and len(cells) > cost_idx:
                    cost_cell = cells[cost_idx]
                    raw_cost_text = cost_cell.get_text(separator=' ', strip=True)
                    number_match = re.search(r'\d+', raw_cost_text)
                    if number_match:
                        cost_value = number_match.group(0) + " Keys"
                
                time_limit = "None"
                if time_idx != -1 and len(cells) > time_idx:
                    time_limit = cells[time_idx].get_text(separator=' ', strip=True)
                    time_limit = re.sub(r'\s+', ' ', time_limit).strip()
                
                if total_eggs > 0:
                    if name not in celestial_data:
                        celestial_data[name] = {
                            "Inventory": {},
                            "Total Eggs": "0",
                            "Cost": "Unknown",
                            "Time Limit": "None"
                        }
                    
                    celestial_data[name]["Inventory"] = inventory
                    celestial_data[name]["Total Eggs"] = str(total_eggs)
                    
                    if cost_value != "Unknown" and celestial_data[name]["Cost"] == "Unknown":
                        celestial_data[name]["Cost"] = cost_value
                        
                    if time_limit != "None" and celestial_data[name]["Time Limit"] == "None":
                        celestial_data[name]["Time Limit"] = time_limit

    output_path = Path("celestials.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(celestial_data, f, indent=2, sort_keys=True)

if __name__ == "__main__":
    scrape_celestials_web()
