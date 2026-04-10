import os
import json
import shutil
from pathlib import Path

def finalize_organization():
    source_dir = Path("downloaded_costumes")
    target_dir = Path("costumes")
    json_path = Path("costumes.json")
    
    # The structure for our JSON
    costume_data = {}

    if not source_dir.exists():
        print(f"Error: {source_dir} not found.")
        return

    # List of known rarities to check for at the start of filenames
    rarity_types = ["Rare", "Epic"]

    print("Sorting costumes and generating JSON...")

    for file_path in source_dir.iterdir():
        if file_path.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.gif']:
            continue

        original_name = file_path.name
        # Clean name for parsing (remove extension)
        clean_name = file_path.stem
        
        # 1. Determine Rarity
        rarity = "Common"
        name_parts = clean_name.split()
        
        if name_parts[0] in rarity_types:
            rarity = name_parts[0]
            # Remove the rarity prefix from the name parts for monster identification
            monster_parts = name_parts[1:]
        else:
            monster_parts = name_parts

        # 2. Extract Monster Name
        # We look for the first part of the name before any "(" or special keywords
        monster_name = ""
        actual_name_parts = []
        for part in monster_parts:
            if "(" in part or part.lower() in ["spooktacle", "yay", "playing"]:
                break
            actual_name_parts.append(part)
        
        monster_name = " ".join(actual_name_parts).strip()

        # Fallback: if somehow monster_name is empty, use the first word
        if not monster_name:
            monster_name = monster_parts[0]

        # 3. Create Folder Structure: costumes/Rarity/MonsterName/
        dest_folder = target_dir / rarity / monster_name
        dest_folder.mkdir(parents=True, exist_ok=True)

        # 4. Move the file
        # We rename the file to use underscores as per your JSON example
        json_filename = original_name.replace(" ", "_")
        dest_file_path = dest_folder / json_filename
        
        shutil.move(str(file_path), str(dest_file_path))

        # 5. Update JSON Data
        if monster_name not in costume_data:
            costume_data[monster_name] = {"Common": [], "Rare": [], "Epic": []}
        
        # Add to the list (using the underscore version for the JSON)
        if json_filename not in costume_data[monster_name][rarity]:
            costume_data[monster_name][rarity].append(json_filename)

    # Clean up empty rarity keys in the JSON to keep it tidy
    for monster in costume_data:
        costume_data[monster] = {k: v for k, v in costume_data[monster].items() if v}

    # Write the JSON file
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(costume_data, f, indent=2, sort_keys=True)

    print(f"\nDone! Sorted files into '{target_dir}/' and created '{json_path}'.")

if __name__ == "__main__":
    finalize_organization()
