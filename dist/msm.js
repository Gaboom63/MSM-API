(function (global) {
  const BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/monsters/";
  const IMAGE_BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/images/bm/";
  const BREEDING_FILE_PATH = "https://raw.githubusercontent.com/Gaboom63/MSM-API/refs/heads/main/data/monsters/Extras/breedingCombos.json";
  const SOUND_BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/sounds/";
  const COSTUME_INDEX_URL = "https://raw.githubusercontent.com/Gaboom63/MSM-API/main/data/costumes.json";

  const cache = {};
  let breedingCache = null;
  let costumeCache = null;
  let nameRegistry = {};

  /* ---------------- BREEDING ---------------- */
  async function getBreedingDatabase() {
    if (breedingCache) return breedingCache;
    try {
      const res = await fetch(BREEDING_FILE_PATH);
      if (!res.ok) throw new Error(`Could not load breeding file from ${BREEDING_FILE_PATH}`);
      const rawData = await res.json();
      const processed = {};

      Object.keys(rawData).forEach(key => {
        if (!key.includes("+")) nameRegistry[key.toLowerCase()] = key;

        if (key.includes("+")) {
          const parts = key.split("+").map(s => s.trim().toLowerCase());
          const sortedKey = parts.sort().join(" + ");
          processed[sortedKey] = processed[sortedKey]
            ? [...new Set([...processed[sortedKey], ...rawData[key]])]
            : rawData[key];

          if (Array.isArray(rawData[key])) {
            rawData[key].forEach(child => nameRegistry[child.toLowerCase()] = child);
          }
        } else {
          processed[key.toLowerCase()] = rawData[key];
        }
      });

      breedingCache = processed;
      return processed;
    } catch (err) {
      console.error("MSM-API: Error loading breeding combos", err);
      return {};
    }
  }

  async function calculateBreeding(comboString) {
    const db = await getBreedingDatabase();
    if (!comboString || !comboString.includes("+")) {
      return ["Invalid format. Please use 'Monster A + Monster B'"];
    }
    const searchKey = comboString.split("+").map(s => s.trim().toLowerCase()).sort().join(" + ");
    return db[searchKey] || ["No combination found."];
  }

  /* ---------------- COSTUMES ---------------- */
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
    
    // Normalize the name: remove "Rare " or "Epic " to find the root species folder
    const cleanName = monsterName.replace(/^(rare|epic)\s+/i, "").trim();

    const entry = db?.[cleanName];
    if (!entry) return [];

    const files = entry[rarity];
    if (!Array.isArray(files)) return [];

    // Base path uses the cleaned species name, then appends rarity folder if not Common
    const basePath = (() => {
        if (rarity === "Common") return `https://raw.githubusercontent.com/Gaboom63/MSM-API/main/data/costumes/${encodeURIComponent(cleanName)}/`;
        return `https://raw.githubusercontent.com/Gaboom63/MSM-API/main/data/costumes/${encodeURIComponent(cleanName)}/${rarity}/`;
    })();

    return files.map(file => `${basePath}${encodeURIComponent(file)}`);
  }

  /* ---------------- MONSTER ---------------- */
  function resolveMonsterPath(rawName) {
    const lowerName = rawName.trim().toLowerCase();
    let folder = "Common";
    let baseNameClean = rawName.trim();

    if (lowerName.startsWith("rare ")) {
      folder = "Rare";
      baseNameClean = rawName.trim().substring(5);
    } else if (lowerName.startsWith("epic ")) {
      folder = "Epic";
      baseNameClean = rawName.trim().substring(5);
    }

    const registryKey = baseNameClean.toLowerCase();
    if (nameRegistry[registryKey]) {
      return { folder, file: nameRegistry[registryKey] };
    }

    const hasCaps = /[A-Z]/.test(baseNameClean);
    const fileName = hasCaps ? baseNameClean : baseNameClean.charAt(0).toUpperCase() + baseNameClean.slice(1);
    return { folder, file: fileName };
  }

  function resolveMonsterSoundName(rawName) {
    let name = rawName.replace(/^(rare|epic)\s+/i, "").trim();
    name = name.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, "_");
    return `${name}_Memory_Sample.mp3.mpeg`;
  }

  async function getMonster(name) {
    if (cache[name] && !cache[name]._loaded) return cache[name];
    await getBreedingDatabase();

    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Monster "${name}" not found at ${url}`);
      const data = await res.json();

      let rawImage = data.image || file;
      if (!rawImage.toLowerCase().endsWith(".png")) rawImage += ".png";
      const finalImageUrl = rawImage.startsWith("http")
        ? rawImage
        : `${IMAGE_BASE_URL}${encodeURIComponent(rawImage)}`;

      const { rarity, name: baseName } = { rarity: folder, name: data.name };
      const costumes = await resolveCostumes(baseName, folder);

      return {
        ...data,
        rarity: folder,
        imageUrl: finalImageUrl,
        costumes,
        // Start at the "Base Image" position (which corresponds to index = length)
        _costumeIndex: costumes.length,

        getImageURL() { return this.imageUrl; },
        getCostumes() { return this.costumes; },
        
        getCostume(index) { 
          if (!this.costumes || this.costumes.length === 0) return null;
          // If no index is passed, return current state
          const targetIndex = index !== undefined ? index : this._costumeIndex;
          
          // If index matches the length, it means "Base Image"
          if (targetIndex === this.costumes.length) return this.imageUrl;
          
          return this.costumes[targetIndex % this.costumes.length]; 
        },

        nextCostume() { 
          if (!this.costumes || this.costumes.length === 0) return this.imageUrl;
          
          // Cycle through 0 -> ... -> Length-1 -> Length (Base) -> 0
          const cycleSize = this.costumes.length + 1;
          this._costumeIndex = (this._costumeIndex + 1) % cycleSize; 
          
          // If we hit the length, return base image
          if (this._costumeIndex === this.costumes.length) {
              return this.imageUrl;
          }
          
          return this.costumes[this._costumeIndex]; 
        },

        resetCostumes() { 
          // Reset to Base Image state
          this._costumeIndex = this.costumes.length; 
          return this.imageUrl; 
        },

        async loadImage(selector) {
          const el = document.getElementById(selector) || document.querySelector(`.${selector}`);
          if (el) el.src = this.imageUrl;
        },

        isOnIsland(islandName) {
          const search = islandName.toLowerCase();
          const list = (data.islands || []).map(i => i.toLowerCase());
          return list.includes(search)
            ? `${data.name} is on ${islandName}!`
            : `${data.name} is not on ${islandName}.`;
        },

        getInfo() {
          return `${data.name} (${folder}) costs ${data.cost || 'N/A'} and inhabits ${data.islands?.length || 0} islands.`;
        },

        async getBreedingTime() {
          if (!data.breedingTime || data.breedingTime.length === 0) return { breedingTime: "Unknown", enhancedTime: "Unknown" };
          const time = data.breedingTime[0];
          const [breeding, enhanced] = time.includes(", ") ? time.split(", ") : [time, "Unknown"];
          return {
            breedingTime: breeding.replace("Breeding Time: ", ""),
            enhancedTime: enhanced.replace("Enhanced Time: ", "")
          };
        },

        async getBreedingCombos() { return data.breedingCombo; },

        getStatistics() {
          return {
            name: data.name,
            rarity: folder,
            elements: data.elements || [],
            islands: data.islands || [],
            cost: data.cost || "Unknown",
            description: data.description || "No description available.",
          };
        },

        soundFile: resolveMonsterSoundName(data.name),
        soundUrl: `${SOUND_BASE_URL}${encodeURIComponent(resolveMonsterSoundName(data.name))}`,
        getSoundURL() { return this.soundUrl; },
        async playSound() {
          try { const audio = new Audio(this.soundUrl); await audio.play(); } 
          catch { console.warn(`Sound not available for ${data.name}`); }
        }
      };
    } catch (err) {
      console.error(`MSM-API Error:`, err);
      return null;
    }
  }

  /* ---------------- PROXY ---------------- */
  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop);
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (key.toLowerCase() === "get" || key.toLowerCase() === "monster") return getMonster;
      if (cache[key]) return cache[key];

      const placeholder = {
        _loaded: getMonster(key).then(monster => { cache[key] = monster; return monster; })
      };

      const asyncProxy = new Proxy(placeholder, {
        get(_, subProp) {
          return async (...args) => {
            const realMonster = await placeholder._loaded;
            if (!realMonster) return null;
            const val = realMonster[subProp];
            return typeof val === "function" ? val.apply(realMonster, args) : val;
          };
        }
      });

      cache[key] = asyncProxy;
      return asyncProxy;
    }
  });

  if (typeof module !== "undefined" && module.exports) module.exports = MSM;
  else global.MSM = MSM;

})(this);