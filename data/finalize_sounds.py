import os
import json
import shutil
import re
from pathlib import Path

def organize_sounds():
    base_dir = Path("sounds")
    monsters_dir = Path("monsters/Common")
    json_path = Path("sounds.json")

    if not base_dir.exists():
        print(f"Error: {base_dir} not found.")
        return

    # 1. Build a master dictionary of exact monster names
    valid_monsters = []
    for f in monsters_dir.glob("*.json"):
        # Strip prefixes and magical tags so "Owlesque (Major)" just becomes "Owlesque"
        clean_name = f.stem.replace("Adult ", "").replace(" (Major)", "").replace(" (Minor)", "")
        if clean_name not in valid_monsters:
            valid_monsters.append(clean_name)
            
    valid_monsters.sort(key=len, reverse=True)

    # 2. Manual overrides for files with weird naming conventions
    overrides = {
        "NogEarth": "Noggin",
        "Crocus_": "Cruv'laaphtian Crocus",
        "Fungus_": "Faesoddoid Fungus"
    }

    sound_data = {}
    print("Re-evaluating sounds and updating sounds.json...")

    # Recursively find EVERY audio file, even if it was previously sorted into the wrong folder
    all_audio_files = (
        list(base_dir.rglob("*.mp3")) + 
        list(base_dir.rglob("*.wav")) + 
        list(base_dir.rglob("*.ogg"))
    )

    for file_path in all_audio_files:
        original_name = file_path.name
        
        # Replace ONLY underscores with spaces. Leave hyphens intact!
        searchable_name = original_name.replace("_", " ")

        rarity = "Common"
        if searchable_name.lower().startswith("rare "):
            rarity = "Rare"
        elif searchable_name.lower().startswith("epic "):
            rarity = "Epic"

        matched_monster = "Unknown"

        # Check manual overrides first
        for key, val in overrides.items():
            if key.lower() in original_name.lower():
                matched_monster = val
                break

        # Strict Regex matching (prevents "Re" from matching inside "Rare")
        if matched_monster == "Unknown":
            for monster in valid_monsters:
                # \b ensures it only matches whole words
                pattern = r'\b' + re.escape(monster.lower()) + r'\b'
                if re.search(pattern, searchable_name.lower()):
                    matched_monster = monster
                    break

        # Group the non-monster game assets logically
        if matched_monster == "Unknown":
            if "Castle" in original_name:
                matched_monster = "Castles"
            elif "DJ_Epic" in original_name:
                matched_monster = "DJ Epic Tracks"
            elif "Dipsters" in original_name:
                matched_monster = "Dipsters Generic"
            else:
                matched_monster = "Uncategorized"

        dest_folder = base_dir / rarity / matched_monster
        dest_folder.mkdir(parents=True, exist_ok=True)
        dest_file_path = dest_folder / original_name

        # Move the file if it's not already in the perfect spot
        if file_path != dest_file_path:
            shutil.move(str(file_path), str(dest_file_path))

        # Update JSON Data
        if matched_monster not in sound_data:
            sound_data[matched_monster] = {"Common": [], "Rare": [], "Epic": []}

        if original_name not in sound_data[matched_monster][rarity]:
            sound_data[matched_monster][rarity].append(original_name)

    # Clean up empty rarity keys in JSON
    for monster in list(sound_data.keys()):
        sound_data[monster] = {k: v for k, v in sound_data[monster].items() if v}
        if not sound_data[monster]:  
            del sound_data[monster]

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(sound_data, f, indent=2, sort_keys=True)

    # 3. Clean up any empty folders left behind by the restructuring
    for dir_path in sorted(base_dir.rglob('*'), key=lambda x: len(str(x)), reverse=True):
        if dir_path.is_dir() and not any(dir_path.iterdir()):
            dir_path.rmdir()

    print(f"\nDone! Everything is perfectly synced.")

if __name__ == "__main__":
    organize_sounds()
