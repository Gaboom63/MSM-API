import json
from bs4 import BeautifulSoup
from pathlib import Path

def scrape_wublins():
    # Look for the exact file you uploaded!
    file_path = Path("Wublins _ My Singing Monsters Wiki _ Fandom.html")
    
    if not file_path.exists():
        # Fallback if it's in the parent directory
        file_path = Path("../Wublins _ My Singing Monsters Wiki _ Fandom.html")
        if not file_path.exists():
            print("Error: Could not find the Wublins HTML file. Make sure it is in the same folder.")
            return

    print("1. Reading local HTML file...")
    with open(file_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    soup = BeautifulSoup(html_content, 'html.parser')
    tables = soup.find_all('table')
    
    target_tables = []
    for table in tables:
        headers_text = " ".join([th.get_text(separator=' ', strip=True).lower() for th in table.find_all(['th', 'td'])])
        if 'wublin' in headers_text and 'total eggs' in headers_text and 'cost' in headers_text:
            target_tables.append(table)

    print(f" -> Found {len(target_tables)} target table(s).")
    
    wublin_data = {}
    
    print("2. Parsing Wublin inventories...")
    for target_table in target_tables:
        rows = target_table.find_all('tr')
        
        inv_idx = -1
        total_idx = -1
        cost_idx = -1
        time_idx = -1
        data_rows = []
        
        for i, row in enumerate(rows):
            header_cells = [th.get_text(strip=True).lower() for th in row.find_all(['th', 'td'])]
            if 'required inventory' in header_cells:
                inv_idx = header_cells.index('required inventory')
                total_idx = header_cells.index('total eggs')
                cost_idx = header_cells.index('cost')
                if 'time limit' in header_cells:
                    time_idx = header_cells.index('time limit')
                data_rows = rows[i+1:]
                break
        
        if inv_idx == -1:
            continue
            
        for row in data_rows:
            cells = row.find_all(['th', 'td'])
            if len(cells) <= max(inv_idx, total_idx, cost_idx):
                continue
                
            wublin_cell = cells[0]
            name_a = wublin_cell.find_all('a')
            if not name_a:
                continue
                
            name = name_a[-1].get_text(strip=True)
            # Skip header rows that get caught
            if not name or name.lower() == 'wublin':
                continue
                
            inventory_cell = cells[inv_idx]
            inventory = {}
            
            # Scrape the required eggs
            elements = inventory_cell.find_all(['a', 'sup', 'b', 'span'])
            current_egg = None
            for el in elements:
                # Catch the egg name
                if el.name == 'a' and el.get('title'):
                    current_egg = el.get('title')
                # Catch the multiplier (e.g., 'x6')
                elif current_egg:
                    qty_text = el.get_text(strip=True).replace('x', '')
                    if qty_text.isdigit():
                        inventory[current_egg] = int(qty_text)
                        current_egg = None
                    
            total_eggs = cells[total_idx].get_text(strip=True)
            
            # Scrape the cost
            cost_cell = cells[cost_idx]
            cost_value = cost_cell.get_text(separator=' ', strip=True)
            # Clean up the weird Fandom text spacing
            cost_value = cost_value.replace("Coins", " Coins").replace("Diamonds", " Diamonds").replace("Keys", " Keys")
                
            time_limit = cells[time_idx].get_text(strip=True) if time_idx != -1 else "None"
            
            wublin_data[name] = {
                "Inventory": inventory,
                "Total Eggs": total_eggs,
                "Cost": cost_value,
                "Time Limit": time_limit
            }
            
    output_path = Path("wublins.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(wublin_data, f, indent=2, sort_keys=True)
        
    print(f"\nSuccess! Processed {len(wublin_data)} Wublins.")
    print(f"Generated master database -> '{output_path}'.")

if __name__ == "__main__":
    scrape_wublins()
