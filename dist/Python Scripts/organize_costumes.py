import shutil
import re
from pathlib import Path

def create_costume_folders():
    monsters_dir = Path("monsters")
    costumes_dir = Path("costumes")
    rarities = ["Common", "Rare", "Epic"]

    if not monsters_dir.exists():
        print("Error: The 'monsters' directory could not be found.")
        return

    costumes_dir.mkdir(exist_ok=True)

    # Make sure we only grab files, not directories or system files
    loose_costumes = [
        item for item in costumes_dir.iterdir() 
        if item.is_file() and item.name != ".DS_Store"
    ]

    folders_created = 0
    items_moved = 0
    skipped_items = 0

    for rarity in rarities:
        monster_rarity_dir = monsters_dir / rarity
        
        if not monster_rarity_dir.exists():
            continue

        for monster_path in monster_rarity_dir.iterdir():
            if monster_path.name == ".DS_Store" or not monster_path.is_file():
                continue
                
            monster_name = monster_path.stem 
            monster_dest_folder = costumes_dir / rarity / monster_name
            
            if not monster_dest_folder.exists():
                monster_dest_folder.mkdir(parents=True, exist_ok=True)
                folders_created += 1

            # Iterate over a slice [:] so we can safely remove items from the original list
            for costume_item in loose_costumes[:]: 
                # 1. Safer Matching: Use regex word boundaries (\b) so "Maw" doesn't trigger on "Maw-some"
                if re.search(rf'\b{re.escape(monster_name)}\b', costume_item.name, re.IGNORECASE):
                    final_destination = monster_dest_folder / costume_item.name
                    
                    # 2. Prevent Overwrites
                    if not final_destination.exists():
                        shutil.move(str(costume_item), str(final_destination))
                        items_moved += 1
                    else:
                        # If the file is already safely in the folder, delete the loose duplicate
                        costume_item.unlink()
                        skipped_items += 1
                        
                    loose_costumes.remove(costume_item)

    print("\n--- Summary ---")
    print(f"Created {folders_created} new monster folders.")
    print(f"Organized {items_moved} existing costume files into them.")
    if skipped_items > 0:
        print(f"Cleaned up {skipped_items} duplicate loose files.")
    if loose_costumes:
        print(f"Note: {len(loose_costumes)} loose files couldn't be matched to a monster name.")

if __name__ == "__main__":
    create_costume_folders()