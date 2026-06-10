import os
import json

# Paths relative to the root of MSM-API
image_dir = './images/bm'
index_file = './data/monster_index.json'

def generate_index():
    if not os.path.exists(image_dir):
        print(f"❌ Error: Directory {image_dir} not found.")
        return

    # Get all .png files from the monster images folder
    # We strip the '.png' extension to get the clean monster name
    monster_list = [f[:-4] for f in os.listdir(image_dir) if f.endswith('.png')]
    
    # Sort them alphabetically for a cleaner registry
    monster_list.sort()

    try:
        # Ensure the data directory exists
        os.makedirs(os.path.dirname(index_file), exist_ok=True)
        
        # Write the list to monster_index.json
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(monster_list, f, indent=4, ensure_ascii=False)
            
        print(f"✅ Successfully generated {index_file} with {len(monster_list)} monsters!")
    except Exception as e:
        print(f"❌ An error occurred: {e}")

if __name__ == "__main__":
    generate_index()
