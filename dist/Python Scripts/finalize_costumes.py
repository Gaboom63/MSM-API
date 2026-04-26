import os
import json
import shutil
import re
from pathlib import Path

def finalize_organization():
    source_dir = Path("downloaded_costumes")
    target_dir = Path("costumes")
    json_path = Path("costumes.json")
    
    # 1. Load the existing JSON so we append to it
    costume_data = {}
    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            try:
                costume_data = json.load(f)
            except json.JSONDecodeError:
                print("Warning: Existing JSON was invalid or empty. Starting fresh.")

    if not source_dir.exists():
        print(f"Error: {source_dir} not found. Nothing to finalize.")
        return

    print("Sorting costumes and updating JSON...")
    moved_count = 0

    for file_path in source_dir.iterdir():
        if file_path.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
            continue

        original_name = file_path.name
        
        # 2. Normalize: Swap underscores for spaces so we always have clean text to read
        clean_name = file_path.stem.replace("_", " ")
        
        # 3. Safely Extract Rarity using Regex
        rarity = "Common"
        rarity_match = re.match(r'^(Rare|Epic)\s+(.*)', clean_name, re.IGNORECASE)
        
        if rarity_match:
            rarity = rarity_match.group(1).capitalize() # Capitalizes "rare" to "Rare"
            clean_name = rarity_match.group(2) # The rest of the filename
            
        # 4. Extract Monster Name using Regex Split
        # FIXED: Moved (?i) to the very start of the string!
        split_pattern = r'(?i)\(|\b(costumes?|spooktacle|yay|playing)\b| - '
        
        # Take the first chunk (everything before the parenthesis/keyword)
        monster_name_raw = re.split(split_pattern, clean_name)[0]
        
        # Clean up trailing whitespace and any random quotes Fandom uses
        monster_name = monster_name_raw.strip().replace('"', '')

        # Fallback just in case
        if not monster_name:
            monster_name = "Unknown"

        # 5. Create Folders & Move
        dest_folder = target_dir / rarity / monster_name
        dest_folder.mkdir(parents=True, exist_ok=True)

        json_filename = original_name.replace(" ", "_")
        dest_file_path = dest_folder / json_filename
        
        if not dest_file_path.exists():
            shutil.move(str(file_path), str(dest_file_path))
            moved_count += 1
        else:
            # File is already safely organized, delete the loose duplicate
            file_path.unlink()

        # 6. Update JSON Data incrementally
        if monster_name not in costume_data:
            costume_data[monster_name] = {"Common": [], "Rare": [], "Epic": []}
        
        if rarity not in costume_data[monster_name]:
            costume_data[monster_name][rarity] = []
            
        if json_filename not in costume_data[monster_name][rarity]:
            costume_data[monster_name][rarity].append(json_filename)

    # Clean up empty keys in the JSON to keep it tidy
    for monster in list(costume_data.keys()):
        costume_data[monster] = {k: v for k, v in costume_data[monster].items() if v}
        if not costume_data[monster]: 
            del costume_data[monster]

    # Write out the final JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(costume_data, f, indent=2, sort_keys=True)

    print(f"\nDone! Moved {moved_count} files into '{target_dir}/' and updated '{json_path}'.")

if __name__ == "__main__":
    finalize_organization()