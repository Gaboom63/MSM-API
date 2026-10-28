#!/usr/bin/env python3
"""
MSM-API master script (everything in ONE file).

This single file replaces all of these, which can be deleted:
    build.js, check_json.sh, costume_generator.py,
    sound_generator.py, generate_index.py

Pipeline (stops at the first hard failure):
    1. Costume Downloader   -> data/costumes/, data/costumes_index.json
    2. Sound Downloader     -> data/sounds/,   data/sounds_index.json
    3. Monster Index        -> data/monster_index.json
    4. JSON Validator       (must pass before the build)
    5. Master Database      -> data/master_database.json   (always last)

Put this file in the repo root and run:
    python3 run_all.py

Requires:  pip install requests beautifulsoup4
"""

import json
import os
import re
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
    MISSING_LIBS = False
except ImportError:
    MISSING_LIBS = True

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════════════════

ROOT = Path(__file__).resolve().parent

WIKI_API = "https://mysingingmonsters.fandom.com/api.php"
HEADERS = {'User-Agent': 'MSM-API-Archiver/1.0 (Debian Linux; Python Requests)'}
REQUEST_TIMEOUT = 30
RARITIES = ['Common', 'Rare', 'Epic']

# Monsters left out of monster_index.json and master_database.json.
# Use the exact monster folder / file name (no .png extension).
EXCLUDED_MONSTERS = {
    'Plasma Meeb',
    'Shadow Meeb',
    'Crystal Meeb',
    'Mech Meeb',
    'Poison Meeb',
    'Rare Plasma Meeb',
    'Rare Shadow Meeb',
    'Rare Crystal Meeb',
    'Rare Mech Meeb',
    'Rare Poison Meeb',
}

# Folders the JSON validator never descends into.
JSON_SCAN_SKIP_DIRS = {'.git', 'node_modules'}

# ═══════════════════════════════════════════════════════════════════════════
#  TERMINAL STYLING
# ═══════════════════════════════════════════════════════════════════════════

IS_TTY = sys.stdout.isatty()
_COLOR = IS_TTY and "NO_COLOR" not in os.environ
C_GREEN = '\033[92m' if _COLOR else ''
C_YELLOW = '\033[93m' if _COLOR else ''
C_RED = '\033[91m' if _COLOR else ''
C_CYAN = '\033[96m' if _COLOR else ''
C_MAGENTA = '\033[95m' if _COLOR else ''
C_DIM = '\033[2m' if _COLOR else ''
C_RESET = '\033[0m' if _COLOR else ''
C_BOLD = '\033[1m' if _COLOR else ''

BOX_WIDTH = 58


def info(msg):
    print(f"{C_CYAN}[*]{C_RESET} {msg}")


def good(msg):
    print(f"{C_GREEN}[+]{C_RESET} {msg}")


def warn(msg):
    print(f"{C_YELLOW}[~]{C_RESET} {msg}")


def bad(msg):
    print(f"{C_RED}[!]{C_RESET} {msg}")


def note(msg):
    print(f"{C_DIM}    {msg}{C_RESET}")


def fmt_time(seconds):
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {int(seconds % 60):02d}s"


def progress(i, total, name):
    """Live single-line progress (only on a real terminal)."""
    if not IS_TTY:
        return
    display = name[:25].ljust(25)
    sys.stdout.write(f"\r{C_YELLOW}[{i}/{total}]{C_RESET} Processing: {C_BOLD}{display}{C_RESET}")
    sys.stdout.flush()


def clear_progress():
    if IS_TTY:
        sys.stdout.write(f"\r{' ' * 60}\r")
        sys.stdout.flush()


class StepError(Exception):
    """Raised by a step when it cannot continue. `short` is shown in the recap box."""

    def __init__(self, message, short="failed"):
        super().__init__(message)
        self.short = short


def require_web_libs():
    if MISSING_LIBS:
        raise StepError("Missing libraries. Install them with:  pip install requests beautifulsoup4",
                        "missing libraries")


# ═══════════════════════════════════════════════════════════════════════════
#  SHARED DOWNLOAD HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def fetch_wiki_html(page):
    """Fetch the rendered HTML of a Fandom wiki page through the MediaWiki API."""
    params = {
        "action": "parse",
        "page": page,
        "format": "json",
        "disablelimitreport": 1,
        "disableeditsection": 1,
    }
    info("Fetching HTML via Fandom API...")
    try:
        response = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()['parse']['text']['*']
    except Exception as e:
        raise StepError(f"Failed to fetch data: {e}", "could not fetch wiki")


def download_queue(queue, output_dir, rel_prefix):
    """
    Download every item in `queue` (skipping files that already exist).
    Returns (stats, index) where index maps readable name -> relative file path.
    """
    stats = {'new': 0, 'skipped': 0, 'failed': 0}
    index = {}
    total = len(queue)

    for i, (safe_name, data) in enumerate(queue.items(), 1):
        file_name = f"{safe_name}{data['ext']}"
        file_path = os.path.join(output_dir, file_name)

        # Save the readable name -> relative file path mapping for the API
        index[data['name']] = f"{rel_prefix}/{file_name}"

        progress(i, total, data['name'])

        if os.path.exists(file_path):
            stats['skipped'] += 1
            continue

        try:
            resp = requests.get(data['url'], headers=HEADERS, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                with open(file_path, 'wb') as f:
                    f.write(resp.content)
                stats['new'] += 1
            else:
                clear_progress()
                bad(f"HTTP {resp.status_code} for {data['name']}")
                stats['failed'] += 1
        except Exception as e:
            clear_progress()
            bad(f"Failed: {data['name']} - {e}")
            stats['failed'] += 1

    clear_progress()
    return stats, index


def write_json(path, payload):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=4, ensure_ascii=False)


def download_result(stats):
    """Turn download stats into a (status, detail) pair for the recap."""
    good(f"{stats['new']} new, {stats['skipped']} already existed, {stats['failed']} failed")
    if stats['failed']:
        return "warn", f"{stats['new']} new, {stats['failed']} failed"
    return "ok", f"{stats['new']} new, {stats['skipped']} existing"


# ═══════════════════════════════════════════════════════════════════════════
#  STEP 1 - COSTUME DOWNLOADER
# ═══════════════════════════════════════════════════════════════════════════

def step_costumes():
    require_web_libs()
    html_content = fetch_wiki_html("Costumes")

    info("Parsing HTML and searching for costume images...")
    soup = BeautifulSoup(html_content, 'html.parser')

    output_dir = 'data/costumes'
    os.makedirs(output_dir, exist_ok=True)

    queue = {}

    # Fandom wraps its wiki images in <a class="image"> tags. This grabs gallery
    # images, table sprites, and inline costume icons.
    for a_tag in soup.find_all('a', class_='image'):
        img_tag = a_tag.find('img')
        if not img_tag:
            continue

        # Highest-quality source link (Fandom lazy-loads via data-src)
        img_url = img_tag.get('data-src') or img_tag.get('src')
        if not img_url:
            continue

        if img_url.startswith('//'):
            img_url = 'https:' + img_url

        # Clean the URL to get the base image (removes downscaling params)
        parsed_url = urlparse(img_url)
        clean_path = parsed_url.path.split('/revision/')[0]
        ext = os.path.splitext(clean_path)[1]

        if ext.lower() not in ['.png', '.jpg', '.jpeg', '.gif']:
            continue

        # The 'title' on the <a> gives the exact file name ("File:Mammott ... Costume.png")
        raw_title = a_tag.get('title', '')
        if raw_title.startswith('File:'):
            costume_name = raw_title.replace('File:', '').replace(ext, '').strip()
        else:
            costume_name = img_tag.get('alt', '').replace(ext, '').strip()

        if not costume_name:
            costume_name = unquote(os.path.basename(clean_path)).replace(ext, '')

        if not costume_name or len(costume_name) > 60:
            continue

        # Strip characters that are unsafe in file names
        safe_name = "".join(c for c in costume_name if c.isalnum() or c in " -_()").strip()

        if safe_name and safe_name not in queue:
            queue[safe_name] = {
                'name': costume_name,
                'url': img_url.split('/revision/')[0],  # full-resolution CDN URL
                'ext': ext,
            }

    if not queue:
        raise StepError("No costumes found. The HTML structure might have changed.", "no costumes found")

    good(f"Found {len(queue)} unique costumes to process.")
    stats, index = download_queue(queue, output_dir, 'costumes')
    write_json('data/costumes_index.json', index)
    return download_result(stats)


# ═══════════════════════════════════════════════════════════════════════════
#  STEP 2 - SOUND DOWNLOADER
# ═══════════════════════════════════════════════════════════════════════════

def step_sounds():
    require_web_libs()
    html_content = fetch_wiki_html("Monster_Sounds")

    info("Parsing HTML and searching for audio links...")
    soup = BeautifulSoup(html_content, 'html.parser')

    tabs = soup.find_all('div', class_='wds-tab__content')
    container = tabs[0] if tabs else soup

    output_dir = 'data/sounds'
    os.makedirs(output_dir, exist_ok=True)

    queue = {}

    for table in container.find_all('table'):
        for row in table.find_all('tr'):
            cols = row.find_all(['td', 'th'])
            if len(cols) < 2:
                continue

            # Find the monster name (first link with real text bypasses image links)
            monster_name = ""
            for a_tag in cols[0].find_all('a'):
                if a_tag.text.strip():
                    monster_name = a_tag.text.strip()
                    break

            if not monster_name:
                monster_name = cols[0].get_text(strip=True)

            monster_name = monster_name.replace('*', '').strip()

            # Safety net: skip massive table headers or raw URLs
            if not monster_name or len(monster_name) > 40 or "http" in monster_name:
                continue

            # Find the audio link
            audio_url = None
            for tag in row.find_all(True):
                for attr in ['src', 'data-file', 'data-src', 'href']:
                    if tag.has_attr(attr):
                        val = tag[attr]
                        val_lower = val.lower()
                        if (('.mp3' in val_lower or '.ogg' in val_lower or '.wav' in val_lower)
                                and '/wiki/file:' not in val_lower):
                            audio_url = val
                            break
                if audio_url:
                    break

            if not audio_url:
                continue

            if audio_url.startswith('//'):
                audio_url = 'https:' + audio_url

            parsed_url = urlparse(audio_url)
            clean_path = parsed_url.path.split('/revision/')[0]
            ext = os.path.splitext(clean_path)[1] or '.ogg'

            safe_name = "".join(c for c in monster_name if c.isalnum() or c in " -_()").strip()

            if safe_name not in queue:
                queue[safe_name] = {'name': monster_name, 'url': audio_url, 'ext': ext}

    if not queue:
        raise StepError("No monsters found. The HTML structure might have changed.", "no sounds found")

    good(f"Found {len(queue)} unique monsters to process.")
    stats, index = download_queue(queue, output_dir, 'sounds')
    write_json('data/sounds_index.json', index)
    return download_result(stats)


# ═══════════════════════════════════════════════════════════════════════════
#  STEP 3 - MONSTER INDEX
# ═══════════════════════════════════════════════════════════════════════════

def step_monster_index():
    image_dir = './images/bm'
    index_file = './data/monster_index.json'

    if not os.path.exists(image_dir):
        raise StepError(f"Directory {image_dir} not found.", "images/bm not found")

    # Strip '.png' to get the clean monster name, sorted for a tidy registry
    monsters = sorted(
        f[:-4] for f in os.listdir(image_dir)
        if f.endswith('.png') and f[:-4] not in EXCLUDED_MONSTERS
    )

    os.makedirs(os.path.dirname(index_file), exist_ok=True)
    write_json(index_file, monsters)

    good(f"Generated {index_file} with {len(monsters)} monsters")
    return "ok", f"{len(monsters)} monsters"


# ═══════════════════════════════════════════════════════════════════════════
#  STEP 4 - JSON VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════

def step_validate_json():
    info(f"Scanning for JSON errors starting from: {os.getcwd()}")

    checked = 0
    invalid = []

    for dirpath, dirnames, filenames in os.walk('.'):
        dirnames[:] = sorted(d for d in dirnames if d not in JSON_SCAN_SKIP_DIRS)
        for name in sorted(filenames):
            if not name.endswith('.json'):
                continue
            path = os.path.join(dirpath, name)
            checked += 1
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    json.load(f)
            except Exception as e:
                invalid.append(path)
                bad(f"Invalid JSON: {path}")
                note(str(e))

    if invalid:
        raise StepError(f"{len(invalid)} invalid JSON file(s) found. Fix them before building.",
                        f"{len(invalid)} invalid file{'s' if len(invalid) != 1 else ''}")

    good(f"All {checked} JSON files are valid")
    return "ok", f"{checked} files valid"


# ═══════════════════════════════════════════════════════════════════════════
#  STEP 5 - MASTER DATABASE BUILD  (always last)
# ═══════════════════════════════════════════════════════════════════════════

def step_build():
    data_dir = Path('data')
    images_dir = Path('images')
    output_file = data_dir / 'master_database.json'

    master = {
        "Image Manifest": {},
        "Element Image Manifest": {},
        "Island Manifest": {},
        "Costumes": {},
        "Sounds": {},
        "Islands": {},
    }
    problems = 0

    info("Scanning file system to build master database...")

    # 1. Image Manifest & Islands roster from /data/Monsters/
    monsters_dir = data_dir / 'Monsters'
    if monsters_dir.exists():
        for folder in sorted(os.listdir(monsters_dir)):
            folder_path = monsters_dir / folder
            if not folder_path.is_dir():
                continue

            if folder in EXCLUDED_MONSTERS:
                note(f"Excluding monster: {folder}")
                continue

            # Keep the exact casing of the folder for Linux lookups
            master["Image Manifest"][folder] = folder

            data_json = folder_path / 'data.json'
            if data_json.exists():
                try:
                    with open(data_json, 'r', encoding='utf-8') as f:
                        m_data = json.load(f)
                    if isinstance(m_data, dict) and isinstance(m_data.get("Islands"), list):
                        master["Islands"][str(m_data.get("Name") or folder)] = m_data["Islands"]
                except Exception as e:
                    bad(f"Error parsing {data_json}: {e}")
                    problems += 1

    # 2. Element Image Manifest from /images/elements/
    elements_dir = images_dir / 'elements'
    if elements_dir.exists():
        strip_prefixes = [
            'Natural', 'Paironormal', 'Seasonal (Core)', 'Seasonal (Aux)',
            'Seasonal (Aux.)', 'Ethereal', 'Magical', 'Supernatural',
            'Mythical', 'Seasonal',
        ]

        for file in sorted(os.listdir(elements_dir)):
            if not file.endswith('.png'):
                continue

            file_name = Path(file).stem.strip()
            key = file_name

            # Split only on the FIRST " - "
            sep = file_name.find(' - ')
            if sep != -1:
                category = file_name[:sep].strip()
                element = file_name[sep + 3:].strip()
                key = element if category in strip_prefixes else f"{category} {element}"

            if key in master["Element Image Manifest"]:
                warn(f'Duplicate element key "{key}" from "{file}" '
                     f'(already mapped to "{master["Element Image Manifest"][key]}")')
                problems += 1

            master["Element Image Manifest"][key] = file

    # 3. Island Manifest from /images/islands/
    islands_dir = images_dir / 'islands'
    if islands_dir.exists():
        groups = {}

        for file in sorted(os.listdir(islands_dir)):
            if not file.lower().endswith('.png'):
                continue

            # "Plant Island.png" and "Plant Island (Spooktacle Skin).png" -> "plant_island"
            base = Path(file).stem.split('(')[0].strip().lower()
            base = re.sub(r'\s+', '_', base)
            groups.setdefault(base, []).append(f"images/islands/{file}")

        # Some skins drop the word "Island": "Fire Haven (Feast-Ember Skin).png" ->
        # "fire_haven", but the base file is "Fire Haven Island.png" -> "fire_haven_island".
        for key in list(groups.keys()):
            if not key.endswith('_island') and f"{key}_island" in groups:
                groups[f"{key}_island"].extend(groups[key])
                del groups[key]

        # Base image first, then skins alphabetically
        for key in sorted(groups):
            master["Island Manifest"][key] = sorted(
                groups[key],
                key=lambda p: ('(' in p, p.lower(), p),
            )

    # 4. Costumes from /data/costumes/{Common,Rare,Epic}/<Monster>/*.png
    costumes_dir = data_dir / 'costumes'
    for rarity in RARITIES:
        rarity_path = costumes_dir / rarity
        if not rarity_path.exists():
            continue
        for monster in sorted(os.listdir(rarity_path)):
            if monster in EXCLUDED_MONSTERS:
                continue
            monster_path = rarity_path / monster
            if monster_path.is_dir():
                master["Costumes"].setdefault(monster, {})[rarity] = [
                    f for f in sorted(os.listdir(monster_path)) if f.endswith('.png')
                ]

    # 5. Sounds from /data/sounds/{Common,Rare,Epic}/<Monster>/*.(mp3|wav|ogg)
    sounds_dir = data_dir / 'sounds'
    for rarity in RARITIES:
        rarity_path = sounds_dir / rarity
        if not rarity_path.exists():
            continue
        for monster in sorted(os.listdir(rarity_path)):
            if monster in EXCLUDED_MONSTERS:
                continue
            monster_path = rarity_path / monster
            if monster_path.is_dir():
                master["Sounds"].setdefault(monster, {})[rarity] = [
                    f for f in sorted(os.listdir(monster_path))
                    if f.lower().endswith(('.mp3', '.wav', '.ogg'))
                ]

    os.makedirs(data_dir, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(master, f, indent=2, ensure_ascii=False)

    good(f"Wrote {output_file}")
    detail = f"{len(master['Image Manifest'])} monsters, {len(master['Element Image Manifest'])} elements"
    return ("warn" if problems else "ok"), detail


# ═══════════════════════════════════════════════════════════════════════════
#  PIPELINE  (order matters only for the last two: JSON check, then build)
# ═══════════════════════════════════════════════════════════════════════════

STEPS = [
    {"name": "Costume Downloader", "fn": step_costumes},
    {"name": "Sound Downloader", "fn": step_sounds},
    {"name": "Monster Index", "fn": step_monster_index},
    {"name": "JSON Validator", "fn": step_validate_json},
    {"name": "Master Database Build", "fn": step_build},
]

STATUS_STYLE = {
    "ok": ("✔", C_GREEN),
    "warn": ("⚠", C_YELLOW),
    "failed": ("✘", C_RED),
    "skipped": ("–", C_YELLOW),
    "pending": ("·", C_DIM),
}


def banner(index, total, name):
    line = "─" * (BOX_WIDTH - 2)
    print(f"\n{C_BOLD}{C_CYAN}{line}{C_RESET}")
    print(f"{C_BOLD}{C_YELLOW}[{index}/{total}]{C_RESET} {C_BOLD}{name}{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}{line}{C_RESET}")


def run_step(step):
    start = time.time()
    try:
        status, detail = step["fn"]()
    except StepError as e:
        status, detail = "failed", e.short
        bad(str(e))
    except KeyboardInterrupt:
        raise
    except Exception as e:  # unexpected crash inside a step
        status, detail = "failed", type(e).__name__
        bad(f"Unexpected error: {e}")
        traceback.print_exc()

    step["status"] = status
    step["detail"] = detail
    step["elapsed"] = time.time() - start

    icon, color = STATUS_STYLE[status]
    label = {"ok": "finished", "warn": "finished with warnings", "failed": "failed"}[status]
    print(f"\n{color}[{icon}]{C_RESET} {step['name']} {label} in {fmt_time(step['elapsed'])}")


def box_row(icon, color, name, right_text):
    left_plain = f" {icon} {name}"
    max_right = BOX_WIDTH - len(left_plain) - 2
    if len(right_text) > max_right:
        right_text = right_text[:max(0, max_right - 1)] + "…"
    right_plain = right_text + " "
    pad = max(1, BOX_WIDTH - len(left_plain) - len(right_plain))
    return (f"{C_BOLD}{C_CYAN}│{C_RESET} {color}{icon}{C_RESET} {name}"
            f"{' ' * pad}{color}{right_text}{C_RESET} {C_BOLD}{C_CYAN}│{C_RESET}")


def recap(total_elapsed):
    top = f"{C_BOLD}{C_CYAN}┌{'─' * BOX_WIDTH}┐{C_RESET}"
    mid = f"{C_BOLD}{C_CYAN}├{'─' * BOX_WIDTH}┤{C_RESET}"
    bot = f"{C_BOLD}{C_CYAN}└{'─' * BOX_WIDTH}┘{C_RESET}"

    statuses = [s.get("status", "pending") for s in STEPS]
    if "failed" in statuses:
        title, title_color = "PRE-PUSH CHECK FAILED", C_RED
    elif "warn" in statuses:
        title, title_color = "PASSED WITH WARNINGS", C_YELLOW
    else:
        title, title_color = "ALL CHECKS PASSED", C_GREEN

    pad_l = (BOX_WIDTH - len(title)) // 2
    pad_r = BOX_WIDTH - len(title) - pad_l

    print()
    print(top)
    print(f"{C_BOLD}{C_CYAN}│{C_RESET}{' ' * pad_l}{C_BOLD}{title_color}{title}{C_RESET}"
          f"{' ' * pad_r}{C_BOLD}{C_CYAN}│{C_RESET}")
    print(mid)

    for s in STEPS:
        status = s.get("status", "pending")
        icon, color = STATUS_STYLE[status]
        if status in ("ok", "warn"):
            right = f"{s['detail']} · {fmt_time(s['elapsed'])}" if s["detail"] else fmt_time(s["elapsed"])
        elif status == "failed":
            right = s["detail"]
        else:
            right = "skipped"
        print(box_row(icon, color, s["name"], right))

    print(mid)
    total_plain = " Total time"
    t = fmt_time(total_elapsed) + " "
    pad = BOX_WIDTH - len(total_plain) - len(t)
    print(f"{C_BOLD}{C_CYAN}│{C_RESET} {C_BOLD}Total time{C_RESET}{' ' * (pad - 1)}{t}{C_BOLD}{C_CYAN}│{C_RESET}")
    print(bot)

    if "failed" in statuses:
        print(f"\n{C_RED}{C_BOLD}Fix the error above, then run this again before pushing.{C_RESET}\n")
    elif "warn" in statuses:
        print(f"\n{C_YELLOW}{C_BOLD}Finished, but check the warnings above before pushing.{C_RESET}\n")
    else:
        print(f"\n{C_GREEN}{C_BOLD}Everything looks good. Safe to push to GitHub!{C_RESET}\n")


def main():
    print(f"\n{C_BOLD}{C_MAGENTA}=== MSM-API Pre-Push Master Script ==={C_RESET}\n")

    if MISSING_LIBS:
        bad("Missing libraries. Install them with:  pip install requests beautifulsoup4")
        sys.exit(1)

    # All paths in the steps are relative to the repo root
    os.chdir(ROOT)
    info(f"Running {len(STEPS)} steps from {C_BOLD}{ROOT}{C_RESET}")

    start = time.time()
    aborted = False

    try:
        for i, step in enumerate(STEPS, 1):
            if aborted:
                step["status"] = "skipped"
                continue
            banner(i, len(STEPS), step["name"])
            run_step(step)
            if step["status"] == "failed":
                aborted = True
    except KeyboardInterrupt:
        print(f"\n\n{C_YELLOW}[!] Interrupted by user.{C_RESET}")
        for step in STEPS:
            if "status" not in step:
                step["status"] = "skipped"
        recap(time.time() - start)
        sys.exit(130)

    recap(time.time() - start)
    sys.exit(1 if aborted else 0)


if __name__ == "__main__":
    main()
