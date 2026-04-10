import shutil
from pathlib import Path

def create_costume_folders():
    monsters_dir = Path("monsters")
    costumes_dir = Path("costumes")
    rarities = ["Common", "Rare", "Epic"]

    if not monsters_dir.exists():
        print("Error: The 'monsters' directory could not be found.")
        return

    # Ensure the main costumes directory exists
    costumes_dir.mkdir(exist_ok=True)

    # Grab any loose files currently in the costumes folder so we can tuck them away later
    loose_costumes = [
        item for item in costumes_dir.iterdir() 
        if item.name not in rarities and item.name != ".DS_Store"
    ]

    folders_created = 0
    items_moved = 0

    # Step 1: Go through Common, Rare, and Epic
    for rarity in rarities:
        monster_rarity_dir = monsters_dir / rarity
        
        if not monster_rarity_dir.exists():
            continue

        # Step 2: Scan EVERY file in the monsters/Rarity folder
        for monster_path in monster_rarity_dir.iterdir():
            if monster_path.name == ".DS_Store": # Ignore Mac system files
                continue
                
            monster_name = monster_path.stem 

            # Step 3: Create the dedicated folder for this monster
            monster_dest_folder = costumes_dir / rarity / monster_name
            
            if not monster_dest_folder.exists():
                monster_dest_folder.mkdir(parents=True, exist_ok=True)
                print(f"Created folder: costumes/{rarity}/{monster_name}/")
                folders_created += 1

            # Step 4: If a loose costume file matching this monster exists, move it inside
            for costume_item in loose_costumes[:]: 
                if monster_name.lower() in costume_item.name.lower():
                    final_destination = monster_dest_folder / costume_item.name
                    shutil.move(str(costume_item), str(final_destination))
                    print(f"  -> Moved {costume_item.name} into the new {monster_name} folder.")
                    loose_costumes.remove(costume_item)
                    items_moved += 1

    print("\n--- Summary ---")
    print(f"Created {folders_created} new monster folders.")
    print(f"Organized {items_moved} existing costume files into them.")

if __name__ == "__main__":
    create_costume_folders()