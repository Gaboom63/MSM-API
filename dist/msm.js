(function (global) {
  const BASE_URL =
    "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/monsters/";
  const IMAGE_BASE_URL =
    "https://raw.githubusercontent.com/gaboom63/MSM-API/master/images/bm/";
  const SOUND_BASE_URL =
    "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/sounds/";
  const BREEDING_FILE_PATH =
    "https://raw.githubusercontent.com/Gaboom63/MSM-API/refs/heads/main/data/monsters/Extras/breedingCombos.json";

  const COSTUME_INDEX_URL = 
    "https://raw.githubusercontent.com/Gaboom63/MSM-API/main/data/costumes.json";

  const COSTUME_BASE_URL =
  "https://raw.githubusercontent.com/Gaboom63/MSM-API/main/data/costumes/";
  
  const cache = {};
  let breedingCache = null;
  let costumeCache = null;
  const nameRegistry = {};

  /* ---------------- BREEDING ---------------- */

  async function getBreedingDatabase() {
    if (breedingCache) return breedingCache;

    try {
      const res = await fetch(BREEDING_FILE_PATH);
      if (!res.ok) throw new Error("Failed to load breeding combos");
      const raw = await res.json();

      const processed = {};

      Object.keys(raw).forEach(key => {
        if (!key.includes("+")) {
          nameRegistry[key.toLowerCase()] = key;
        }

        if (key.includes("+")) {
          const parts = key
            .split("+")
            .map(s => s.trim().toLowerCase())
            .sort();
          const sortedKey = parts.join(" + ");

          processed[sortedKey] ??= [];
          processed[sortedKey] = [
            ...new Set([...processed[sortedKey], ...raw[key]])
          ];

          raw[key]?.forEach(child => {
            nameRegistry[child.toLowerCase()] = child;
          });
        } else {
          processed[key.toLowerCase()] = raw[key];
        }
      });

      breedingCache = processed;
      return processed;
    } catch (err) {
      console.error("MSM-API: Breeding load error", err);
      return {};
    }
  }

  async function calculateBreeding(comboString) {
    if (!comboString?.includes("+")) {
      return ["Invalid format. Use 'Monster A + Monster B'"];
    }

    const db = await getBreedingDatabase();

    const key = comboString
      .split("+")
      .map(s => s.trim().toLowerCase())
      .sort()
      .join(" + ");

    return db[key] || ["No combination found."];
  }

  /* ---------------- NAME / RARITY ---------------- */

  function resolveMonsterRarityAndName(rawName) {
    const lower = rawName.trim().toLowerCase();

    if (lower.startsWith("rare ")) {
      return { rarity: "Rare", name: rawName.trim().slice(5) };
    }
    if (lower.startsWith("epic ")) {
      return { rarity: "Epic", name: rawName.trim().slice(5) };
    }
    return { rarity: "Common", name: rawName.trim() };
  }

  function resolveMonsterPath(rawName) {
    const { rarity, name } = resolveMonsterRarityAndName(rawName);

    const registryKey = name.toLowerCase();
    const file =
      nameRegistry[registryKey] ||
      (/[A-Z]/.test(name)
        ? name
        : name.charAt(0).toUpperCase() + name.slice(1));

    return { folder: rarity, file };
  }

  function resolveMonsterSoundName(rawName) {
    let name = rawName.replace(/^(rare|epic)\s+/i, "").trim();
    name = name.replace(/\b\w/g, c => c.toUpperCase());
    name = name.replace(/\s+/g, "_");
    return `${name}_Memory_Sample.mp3.mpeg`;
  }

  /* ---------------- COSTUME FETCH (DIRECTORY LISTING) ---------------- */

 async function getCostumeDatabase() {
  if (costumeCache) return costumeCache;

  try {
    const res = await fetch(COSTUME_INDEX_URL);
    if (!res.ok) throw new Error("Failed to load costumes.json");
    costumeCache = await res.json();
    return costumeCache;
  } catch (err) {
    console.error("MSM-API: Costume load error", err);
    return {};
  }
}

async function resolveCostumes(monsterName, rarity) {
  const db = await getCostumeDatabase();
  const entry = db?.[monsterName];
  if (!entry) return [];

  const files = entry[rarity];
  if (!Array.isArray(files)) return [];

  const basePath =
    rarity === "Common"
      ? `${COSTUME_BASE_URL}${encodeURIComponent(monsterName)}/`
      : `${COSTUME_BASE_URL}${encodeURIComponent(monsterName)}/${rarity}/`;

  return files.map(file =>
    `${basePath}${encodeURIComponent(file)}`
  );
}


  /* ---------------- MONSTER ---------------- */

  async function getMonster(name) {
    if (cache[name] && !cache[name]._loaded) return cache[name];

    await getBreedingDatabase();

    const { folder, file } = resolveMonsterPath(name);
    const { rarity, name: baseName } = resolveMonsterRarityAndName(name);

    const registryName =
      nameRegistry[baseName.toLowerCase()] || baseName;

    const url = `${BASE_URL}${folder}/${file}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Monster not found: ${name}`);
      const data = await res.json();

      let img = data.image || file;
      if (!img.toLowerCase().endsWith(".png")) img += ".png";

      const imageUrl = img.startsWith("http")
        ? img
        : `${IMAGE_BASE_URL}${encodeURIComponent(img)}`;

      const costumes = await resolveCostumes(registryName, rarity);

      return {
        ...data,
        rarity,
        imageUrl,
        costumes,
        _costumeIndex: 0,

        getImageURL() {
          return this.imageUrl;
        },

        getCostumes() {
          return this.costumes;
        },

        getCostume(index = 0) {
          if (!this.costumes.length) return null;
          return this.costumes[index % this.costumes.length];
        },

        nextCostume() {
          this._costumeIndex++;
          return this.getCostume(this._costumeIndex);
        },

        resetCostumes() {
          this._costumeIndex = 0;
          return this.getCostume(0);
        },

        async loadImage(selector) {
          const el =
            document.getElementById(selector) ||
            document.querySelector(`.${selector}`);
          if (el) el.src = this.imageUrl;
        },

        soundFile: resolveMonsterSoundName(data.name),
        soundUrl: `${SOUND_BASE_URL}${encodeURIComponent(
          resolveMonsterSoundName(data.name)
        )}`,

        async playSound() {
          try {
            await new Audio(this.soundUrl).play();
          } catch {
            console.warn(`Sound not available for ${data.name}`);
          }
        }
      };
    } catch (err) {
      console.error("MSM-API Error:", err);
      return null;
    }
  }

  /* ---------------- PROXY ---------------- */

  const MSM = new Proxy({}, {
    get(_, prop) {
      const key = String(prop);

      if (key === "twoMonsterCombo") return calculateBreeding;
      if (key.toLowerCase() === "get") return getMonster;

      if (cache[key]) return cache[key];

      const placeholder = {
        _loaded: getMonster(key).then(mon => {
          cache[key] = mon;
          return mon;
        })
      };

      const proxy = new Proxy(placeholder, {
        get(_, sub) {
          return async (...args) => {
            const real = await placeholder._loaded;
            if (!real) return null;
            const val = real[sub];
            return typeof val === "function"
              ? val.apply(real, args)
              : val;
          };
        }
      });

      cache[key] = proxy;
      return proxy;
    }
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
