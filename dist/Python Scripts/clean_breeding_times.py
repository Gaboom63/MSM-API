import json
from pathlib import Path

def remove_legacy_breeding_times():
    base_dir = Path("monsters")
    
    if not base_dir.exists():
        print("Error: 'monsters' directory not found.")
        return

    modified_count = 0
    total_files = 0

    for file_path in base_dir.rglob("*.json"):
        total_files += 1
        
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                continue
                
        if isinstance(data, dict) and "breedingTime" in data:
            del data["breedingTime"]
            
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, sort_keys=True)
                
            modified_count += 1

    print(f"\nScanned {total_files} files.")
    print(f"Successfully removed 'breedingTime' from {modified_count} files.")

if __name__ == "__main__":
    remove_legacy_breeding_times()
