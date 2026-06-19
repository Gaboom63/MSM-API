import json
from pathlib import Path

MONSTERS_DIR = Path("Monsters")

for data_file in MONSTERS_DIR.rglob("data.json"):
    try:
        with open(data_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        combos = data.get("Combinations to Breed")

        if isinstance(combos, list) and "Any Wublin" in combos:
            monster_name = data.get("Name")

            if not monster_name:
                print(f"Skipping {data_file}: no Name field")
                continue

            data["Combinations to Breed"] = [
                f"Zap The Eggs Needed To Fill {monster_name}"
                if combo == "Any Wublin"
                else combo
                for combo in combos
            ]

            with open(data_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"Updated {monster_name}")

    except Exception as e:
        print(f"Error processing {data_file}: {e}")

print("Done!")
