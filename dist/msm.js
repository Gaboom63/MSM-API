(function (global) {
  /* ---------------- CONFIG & PERSISTENT CACHE ---------------- */
  let COMMIT_HASH = localStorage.getItem('msm_api_hash') || 'main'; 
  let BASE_URL, IMAGE_BASE_URL, SOUND_BASE_URL, ELEMENTS_URL, BREEDING_FILE_PATH, COSTUME_INDEX_URL, ELEMENT_INDEX_URL;

  function updateUrls() {
    BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/monsters/`;
    IMAGE_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/bm/`;
    SOUND_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/sounds/`;
    ELEMENTS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/elements/`;
    BREEDING_FILE_PATH = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/monsters/Extras/breedingCombos.json`;
    COSTUME_INDEX_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes.json`;
    ELEMENT_INDEX_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/elements.json`;
  }

  // AUTO-SYNC WITH SMART COOLDOWN (Checks GitHub once every 10 mins)
  async function syncToLatestCommit() {
    const lastCheck = localStorage.getItem('msm_hash_last_check') || 0;
    const now = Date.now();
    
    // If we checked in the last 10 minutes, skip the network request!
    if (now - lastCheck < 600000 && COMMIT_HASH !== 'main') {
        updateUrls();
        return;
    }

    try {
      const res = await fetch('https://api.github.com/repos/Gaboom63/MSM-API/commits/main', { credentials: 'omit' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (COMMIT_HASH !== data.sha) {
          COMMIT_HASH = data.sha;
          localStorage.setItem('msm_api_hash', COMMIT_HASH);
          // If the hash changed, we clear the monster cache to prevent bugs
          Object.keys(localStorage).forEach(key => { if(key.startsWith('msm_data_')) localStorage.removeItem(key); });
      }
      localStorage.setItem('msm_hash_last_check', now);
    } catch (err) { console.warn("Sync failed, using cached hash."); }
    finally { updateUrls(); }
  }

  updateUrls();
  const syncPromise = syncToLatestCommit();

  const cache = {}; // Memory cache for the current session
  let breedingCache = null;
  let costumeCache = null;
  let elementCache = null;
  let nameRegistry = {};

  /* ---------------- HELPERS ---------------- */
  async function fetchWithCache(storageKey, url) {
    // 1. Check Memory
    if (cache[storageKey]) return cache[storageKey];
    
    // 2. Check LocalStorage
    const saved = localStorage.getItem(`msm_data_${storageKey}`);
    if (saved) {
        const parsed = JSON.parse(saved);
        cache[storageKey] = parsed;
        return parsed;
    }

    // 3. Network Fetch
    try {
        const res = await fetch(url, { credentials: 'omit' });
        const data = await res.json();
        localStorage.setItem(`msm_data_${storageKey}`, JSON.stringify(data));
        cache[storageKey] = data;
        return data;
    } catch (e) { return null; }
  }

  /* ---------------- ELEMENTS ---------------- */
  async function getElementDatabase() {
    await syncPromise;
    if (elementCache) return elementCache;
    elementCache = await fetchWithCache('elements_db', ELEMENT_INDEX_URL);
    return elementCache || {};
  }

  function normalizeElementName(name) { return name.toLowerCase().replace(/\s+/g, "-"); }

  async function resolveElementImage(elementName) {
    if (!elementName) return null;
    const name = typeof elementName === 'object' ? (elementName.name || elementName.id) : elementName;
    const db = await getElementDatabase();
    const normalized = normalizeElementName(name);
    let file = db[name] || db[name.toLowerCase()] || db[normalized] || db[`${normalized}-element`];
    return file ? `${ELEMENTS_URL}${encodeURIComponent(file)}` : null;
  }

  /* ---------------- BREEDING ---------------- */
  async function getBreedingDatabase() {
    await syncPromise;
    if (breedingCache) return breedingCache;
    const rawData = await fetchWithCache('breeding_db', BREEDING_FILE_PATH);
    if (!rawData) return {};

    const processed = {};
    Object.keys(rawData).forEach(key => {
        if (!key.includes("+")) nameRegistry[key.toLowerCase()] = key;
        if (key.includes("+")) {
            const parts = key.split("+").map(s => s.trim().toLowerCase());
            const sortedKey = parts.sort().join(" + ");
            processed[sortedKey] = processed[sortedKey] ? [...new Set([...processed[sortedKey], ...rawData[key]])] : rawData[key];
            if (Array.isArray(rawData[key])) rawData[key].forEach(child => nameRegistry[child.toLowerCase()] = child);
        } else { processed[key.toLowerCase()] = rawData[key]; }
    });
    breedingCache = processed;
    return processed;
  }

  async function calculateBreeding(comboString) {
    const db = await getBreedingDatabase();
    if (!comboString || !comboString.includes("+")) return ["Invalid format"];
    const searchKey = comboString.split("+").map(s => s.trim().toLowerCase()).sort().join(" + ");
    return db[searchKey] || ["No combination found."];
  }

  /* ---------------- COSTUMES ---------------- */
  async function getCostumeDatabase() {
    await syncPromise;
    if (costumeCache) return costumeCache;
    costumeCache = await fetchWithCache('costumes_db', COSTUME_INDEX_URL);
    return costumeCache || {};
  }

  async function resolveCostumes(monsterName, rarity) {
    const db = await getCostumeDatabase();
    const cleanName = monsterName.replace(/^(rare|epic)\s+/i, "").trim();
    const entry = db?.[cleanName];
    if (!entry || !Array.isArray(entry[rarity])) return [];
    const basePath = rarity === "Common"
      ? `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${encodeURIComponent(cleanName)}/`
      : `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${encodeURIComponent(cleanName)}/${rarity}/`;
    return entry[rarity].map(file => `${basePath}${encodeURIComponent(file)}`);
  }

  /* ---------------- PATHS ---------------- */
  function resolveMonsterPath(rawName) {
    const lowerName = rawName.trim().toLowerCase();
    let folder = "Common", baseNameClean = rawName.trim();
    if (lowerName.startsWith("rare ")) { folder = "Rare"; baseNameClean = rawName.substring(5).trim(); }
    else if (lowerName.startsWith("epic ")) { folder = "Epic"; baseNameClean = rawName.substring(5).trim(); }
    const registryKey = baseNameClean.toLowerCase();
    const fileName = nameRegistry[registryKey] || (baseNameClean.charAt(0).toUpperCase() + baseNameClean.slice(1));
    return { folder, file: fileName, baseNameClean };
  }

  function resolveMonsterSoundName(rawName) {
    let name = rawName.replace(/^(rare|epic)\s+/i, "").trim();
    return `${name.replace(/\s+/g, "_")}_Memory_Sample.mp3.mpeg`;
  }

  /* ---------------- MAIN FETCH ---------------- */
  async function getMonster(name) {
    await syncPromise;
    const { folder, file, baseNameClean } = resolveMonsterPath(name);
    const storageKey = `monster_${folder}_${file}`;
    const url = `${BASE_URL}${folder}/${encodeURIComponent(file)}.json`;

    // Try to get data from persistent cache
    const data = await fetchWithCache(storageKey, url);
    if (!data) return null;

    try {
      let rawImage = data.image || data.name;
      if (!rawImage.toLowerCase().endsWith(".png")) rawImage += ".png";
      const finalImageUrl = rawImage.startsWith("http") ? rawImage : `${IMAGE_BASE_URL}${encodeURIComponent(rawImage.trim())}`;
      
      // Parallelize costume resolution
      const costumes = await resolveCostumes(data.name, folder);

      return {
        ...data, rarity: folder, imageUrl: finalImageUrl, costumes, _costumeIndex: costumes.length,

        async getElementImages() {
          const rawEls = data.element || data.elements || [];
          let elements = Array.isArray(rawEls) ? rawEls.flat() : [];
          if (elements.length === 0 && (folder === "Rare" || folder === "Epic")) {
            const common = await getMonster(baseNameClean);
            if (common) {
              const commonRaw = common.element || common.elements || [];
              elements = Array.isArray(commonRaw) ? commonRaw.flat() : [];
            }
          }
          return Promise.all(elements.map(async el => ({ name: el, image: await resolveElementImage(el) })));
        },

        getImageURL() { return this.imageUrl; },
        getCostumes() { return this.costumes; },
        getCostume(index) {
          if (!this.costumes.length) return this.imageUrl;
          const i = index ?? this._costumeIndex;
          return i === this.costumes.length ? this.imageUrl : this.costumes[i % this.costumes.length];
        },
        nextCostume() {
          if (!this.costumes.length) return this.imageUrl;
          this._costumeIndex = (this._costumeIndex + 1) % (this.costumes.length + 1);
          return this.getCostume(this._costumeIndex);
        },
        resetCostumes() { this._costumeIndex = this.costumes.length; return this.imageUrl; },
        async loadImage(selector) {
          const el = document.getElementById(selector) || document.querySelector(`.${selector}`);
          if (el) el.src = this.imageUrl;
        },
        isOnIsland(islandName) {
          const list = (data.islands || []).map(i => i.toLowerCase());
          return list.includes(islandName.toLowerCase()) ? `${data.name} is on ${islandName}!` : `${data.name} is not on ${islandName}.`;
        },
        getInfo() { return `${data.name} (${folder}) costs ${data.cost || 'N/A'}.`; },
        async getBreedingTime() {
          if (!data.breedingTime || data.breedingTime.length === 0) return { breedingTime: "Unknown", enhancedTime: "Unknown" };
          const [breeding, enhanced] = data.breedingTime[0].includes(", ") ? data.breedingTime[0].split(", ") : [data.breedingTime[0], "Unknown"];
          return { breedingTime: breeding.replace("Breeding Time: ", ""), enhancedTime: enhanced.replace("Enhanced Time: ", "") };
        },
        async getBreedingCombos() { return data.breedingCombo; },
        getStatistics() { return { ...data, rarity: folder }; },
        soundUrl: `${SOUND_BASE_URL}${encodeURIComponent(resolveMonsterSoundName(data.name))}`,
        async playSound() {
          try {
            const audio = new Audio(this.soundUrl);
            audio.crossOrigin = "anonymous";
            await audio.play();
          } catch { console.warn(`Sound missing for ${data.name}`); }
        }
      };
    } catch (err) { return null; }
  }

  /* ---------------- PROXY ---------------- */
  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop);
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (key.toLowerCase() === "get" || key.toLowerCase() === "monster") return getMonster;
      if (cache[key]) return cache[key];
      const placeholder = { _loaded: getMonster(key).then(m => (cache[key] = m)) };
      return new Proxy(placeholder, {
        get(_, sub) {
          return async (...args) => {
            const real = await placeholder._loaded;
            if (!real) return null;
            const val = real[sub];
            return typeof val === "function" ? val.apply(real, args) : val;
          };
        }
      });
    }
  });

  if (typeof module !== "undefined" && module.exports) module.exports = MSM;
  else global.MSM = MSM;

})(this); 