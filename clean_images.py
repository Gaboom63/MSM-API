import os
import json

# Point this to your monsters data folder
MONSTERS_DIR = './data/monsters'

def clean_monster_images():
    cleaned_count = 0
    
    # Walk through all folders and subfolders (Common, Rare, Epic, etc.)
    for root, _, files in os.walk(MONSTERS_DIR):
        for filename in files:
            if filename.endswith('.json'):
                filepath = os.path.join(root, filename)
                
                try:
                    # Read the JSON file
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    # If the 'image' key exists, delete it!
                    if 'image' in data:
                        del data['image']
                        
                        # Save the file back with nice formatting
                        with open(filepath, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2)
                            
                        print(f"Cleaned up: {filename}")
                        cleaned_count += 1
                        
                except Exception as e:
                    print(f"Whoops, couldn't process {filename}: {e}")

    print(f"\nDone! Successfully scrubbed the hardcoded images from {cleaned_count} files.")

if __name__ == '__main__':
    clean_monster_images()