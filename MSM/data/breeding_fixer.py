import json

# Load files
with open("breedingCombos.json", "r", encoding="utf-8") as f:
    breeding_data = json.load(f)

with open("monster_index.json", "r", encoding="utf-8") as f:
    monster_index = json.load(f)

# Collect every monster that appears as a breeding result
breedable_results = set()

for results in breeding_data.values():
    if isinstance(results, list):
        breedable_results.update(results)
    else:
        breedable_results.add(results)

# Monsters to ignore
IGNORE_PREFIXES = (
    "Adult ",
)

IGNORE_CONTAINS = (
    "(Minor)",
    "Wubbox",
)

IGNORE_EXACT = {
    # Musical notes
    "Do", "Re", "Mi", "Fa", "Sol", "La", "Ti",

    # Celestials
    "Galvana", "Scaratar", "Loodvigg", "Torrt",
    "Plixie", "Attmoz", "Hornacle", "Furnoss",
    "Syncopite", "Vhamp", "Blasoom", "Glaishur",

    # Other special monsters
    "Parlsona",
    "Stoowarb",
    "Tawkerr",
    "Maggpi",
    "Shugajo",
}

missing = []

for monster in monster_index:
    if monster in breedable_results:
        continue

    if monster.startswith(IGNORE_PREFIXES):
        continue

    if any(text in monster for text in IGNORE_CONTAINS):
        continue

    if monster in IGNORE_EXACT:
        continue

    missing.append(monster)

missing.sort()

print("=" * 50)
print(f"Monsters missing breeding combos ({len(missing)})")
print("=" * 50)

for monster in missing:
    print(monster)
