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

  function getStringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    if (s1 === s2) return 1.0;
    
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i++) track[0][i] = i;
    for (let j = 0; j <= s2.length; j++) track[j][0] = j;
    
    for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
        }
    }
    const distance = track[s2.length][s1.length];
    return 1.0 - (distance / Math.max(s1.length, s2.length));
  }
  
  async function syncToLatestCommit() {
    const lastCheck = localStorage.getItem('msm_hash_last_check') || 0;
    const now = Date.now();
    
    if (now - lastCheck < 600000 && COMMIT_HASH !== 'main') {
        updateUrls();
        return;
    }

    try {
      const res = await fetch('https://api.github.com/repos/Gaboom63/MSM-API/commits/main', { credentials: 'omit' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (COMMIT_HASH !== data.sha) {
          const oldHash = COMMIT_HASH;
          COMMIT_HASH = data.sha;
          localStorage.setItem('msm_api_hash', COMMIT_HASH);
          
          // NEW: Cleanup routine to delete old versioned data
          // This keeps localStorage clean while allowing the new data to load!
          Object.keys(localStorage).forEach(key => {
              if (key.startsWith('msm_') && key.includes(oldHash)) {
                  localStorage.removeItem(key);
              }
          });
          
          console.log(`Update detected! Switched from ${oldHash} to ${COMMIT_HASH}`);
      }
      localStorage.setItem('msm_hash_last_check', now);
    } catch (err) { console.warn("Sync failed, using cached hash."); }
    finally { updateUrls(); }
  }

  updateUrls();
  const syncPromise = syncToLatestCommit();

  const cache = {}; 
  let breedingCache = null;
  let costumeCache = null;
  let elementCache = null;
  let nameRegistry = {};

  /* ---------------- HELPERS ---------------- */
/* ---------------- UPDATED HELPERS ---------------- */
async function fetchWithCache(storageKey, url) {
  // 1. Check Memory (Session-based)
  if (cache[storageKey]) return cache[storageKey];
  
  // 2. Version the LocalStorage key using the current COMMIT_HASH
  // This ensures that if the hash changes, the old cache is ignored!
  const versionedKey = `msm_${COMMIT_HASH}_${storageKey}`;
  const saved = localStorage.getItem(versionedKey);
  
  if (saved) {
      const parsed = JSON.parse(saved);
      cache[storageKey] = parsed;
      return parsed;
  }

  // 3. Network Fetch
  try {
      const res = await fetch(url, { credentials: 'omit' });
      const data = await res.json();
      
      // Save using the versioned key
      localStorage.setItem(versionedKey, JSON.stringify(data));
      cache[storageKey] = data;
      return data;
  } catch (e) { return null; }
}

  /* ---------------- ELEMENTS (OPTIMIZED) ---------------- */

  let elementDbPromise = null;
  
async function getElementDatabase() {
    await syncPromise;
    if (elementCache) return elementCache;

    // If a fetch is already in progress, return the existing promise
    if (!elementDbPromise) {
        elementDbPromise = fetchWithCache('elements_db', ELEMENT_INDEX_URL).then(data => {
            elementCache = data || {};
            return elementCache;
        });
    }
    return elementDbPromise;
}

  function normalizeElementName(name) { return name.toLowerCase().replace(/\s+/g, "-"); }

  async function resolveElementImage(elementName) {
    if (!elementName) return null;
    const name = typeof elementName === 'object' ? (elementName.name || elementName.id) : elementName;
    
    // Ensure the DB is loaded before looking up the file
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

async function resolveCostumes(monsterName, rarity = "Common") {
  const db = await getCostumeDatabase();
  
  // 1. Force the rarity to be capitalized correctly, and default to "Common" if it's missing
  const safeRarity = rarity 
    ? rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase() 
    : "Common";

  const cleanName = monsterName.replace(/^(rare|epic)\s+/i, "").trim();
  const entry = db?.[cleanName];
  
  // 2. Use safeRarity to check the database
  if (!entry || !Array.isArray(entry[safeRarity])) return [];
  
  // 3. Inject safeRarity directly into the URL path
  const basePath = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${safeRarity}/${encodeURIComponent(cleanName)}/`;
  
  return entry[safeRarity].map(file => `${basePath}${encodeURIComponent(file)}`);
}

  /* ---------------- PATHS (FAST PATH ADDED) ---------------- */
  function resolveMonsterPath(rawName) {
      const lowerName = rawName.trim().toLowerCase();
      let folder = "Common", baseNameClean = rawName.trim();

      if (lowerName.startsWith("rare ")) { 
          folder = "Rare"; baseNameClean = rawName.substring(5).trim(); 
      } else if (lowerName.startsWith("epic ")) { 
          folder = "Epic"; baseNameClean = rawName.substring(5).trim(); 
      }

      const registryKey = baseNameClean.toLowerCase();
      
      // FAST PATH: If perfect match exists in registry, skip similarity logic
      if (nameRegistry[registryKey]) {
          return { folder, file: nameRegistry[registryKey], baseNameClean };
      }

      let fileName = null;
      let bestScore = 0;
      Object.values(nameRegistry).forEach(regName => {
          const score = getStringSimilarity(baseNameClean, regName);
          if (score > bestScore) {
              bestScore = score;
              fileName = regName;
          }
      });

      fileName = fileName || (baseNameClean.charAt(0).toUpperCase() + baseNameClean.slice(1));
      return { folder, file: fileName, baseNameClean };
  }

  function resolveMonsterSoundName(rawName) {
    let name = rawName.replace(/^(rare|epic)\s+/i, "").trim();
    return `${name.replace(/\s+/g, "_")}_Memory_Sample.mp3.mpeg`;
  }

  /* ---------------- MAIN FETCH ---------------- */
 /* ---------------- MAIN FETCH (FIXED ELEMENT LOADING) ---------------- */
async function getMonster(name) {
  await syncPromise;
  const { folder, file, baseNameClean } = resolveMonsterPath(name);
  const storageKey = `monster_${folder}_${file}`;
  const url = `${BASE_URL}${folder}/${encodeURIComponent(file)}.json`;

  const data = await fetchWithCache(storageKey, url);
  if (!data) return null;

  try {
    let rawImage = data.image || data.name;
    if (!rawImage.toLowerCase().endsWith(".png")) rawImage += ".png";

    const finalImageUrl = rawImage.startsWith("http")
      ? rawImage
      : `${IMAGE_BASE_URL}${encodeURIComponent(rawImage.trim())}`;

    const costumes = await resolveCostumes(data.name, folder);

    /* ---------------- ✅ PRELOAD ELEMENTS ---------------- */

    const elementDb = await getElementDatabase();

    const rawEls = data.element || data.elements || [];
    let elements = Array.isArray(rawEls) ? rawEls.flat() : [];

    // Handle Rare/Epic fallback
if (elements.length === 0 && (folder === "Rare" || folder === "Epic")) {
  const commonPath = resolveMonsterPath(baseNameClean);
  const commonKey = `monster_Common_${commonPath.file}`;
  const commonUrl = `${BASE_URL}Common/${encodeURIComponent(commonPath.file)}.json`;

  const commonData = await fetchWithCache(commonKey, commonUrl);

  if (commonData) {
    const commonRaw = commonData.element || commonData.elements || [];
    elements = Array.isArray(commonRaw) ? commonRaw.flat() : [];
  }
}

    const normalize = (n) => n.toLowerCase().replace(/\s+/g, "-");

    const elementsResolved = elements.map(el => {
      const name = typeof el === "object" ? (el.name || el.id) : el;
      const normalized = normalizeElementName(name);

      const file =
        elementDb[name] ||
        elementDb[name.toLowerCase()] ||
        elementDb[normalized] ||
        elementDb[`${normalized}-element`];

      return {
        name,
        image: file
          ? `${ELEMENTS_URL}${encodeURIComponent(file)}`
          : null
      };
    });

    /* ---------------- RETURN OBJECT ---------------- */

    return {
      ...data,
      rarity: folder,
      imageUrl: finalImageUrl,
      costumes,
      _costumeIndex: costumes.length,

      // ✅ NOW SYNCHRONOUS
      elementsResolved,

      getElementImages() {
        return this.elementsResolved;
      },

      /* ---------------- EXISTING METHODS ---------------- */

      getImageURL() { return this.imageUrl; },

      getCostumes() { return this.costumes; },

      getCostume(index) {
        if (!this.costumes.length) return this.imageUrl;
        const i = index ?? this._costumeIndex;
        return i === this.costumes.length
          ? this.imageUrl
          : this.costumes[i % this.costumes.length];
      },

      nextCostume() {
        if (!this.costumes.length) return this.imageUrl;
        this._costumeIndex =
          (this._costumeIndex + 1) % (this.costumes.length + 1);
        return this.getCostume(this._costumeIndex);
      },

      resetCostumes() {
        this._costumeIndex = this.costumes.length;
        return this.imageUrl;
      },

      async loadImage(selector) {
        const el =
          document.getElementById(selector) ||
          document.querySelector(`.${selector}`);
        if (el) el.src = this.imageUrl;
      },

      isOnIsland(islandName) {
        const list = (data.islands || []).map(i => i.toLowerCase());
        return list.includes(islandName.toLowerCase())
          ? `${data.name} is on ${islandName}!`
          : `${data.name} is not on ${islandName}.`;
      },

      getInfo() {
        return `${data.name} (${folder}) costs ${data.cost || 'N/A'}.`;
      },

      async getBreedingTime() {
        if (!data.breedingTime || data.breedingTime.length === 0) {
          return { breedingTime: "Unknown", enhancedTime: "Unknown" };
        }

        const [breeding, enhanced] =
          data.breedingTime[0].includes(", ")
            ? data.breedingTime[0].split(", ")
            : [data.breedingTime[0], "Unknown"];

        return {
          breedingTime: breeding.replace("Breeding Time: ", ""),
          enhancedTime: enhanced.replace("Enhanced Time: ", "")
        };
      },

      async getBreedingCombos() {
        return data.breedingCombo;
      },

      getStatistics() {
        return { ...data, rarity: folder };
      },

      soundUrl: `${SOUND_BASE_URL}${encodeURIComponent(
        resolveMonsterSoundName(data.name)
      )}`,

      async playSound() {
        try {
          const audio = new Audio(this.soundUrl);
          audio.crossOrigin = "anonymous";
          await audio.play();
        } catch {
          console.warn(`Sound missing for ${data.name}`);
        }
      }
    };

  } catch (err) {
    return null;
  }
}

  /* ---------------- PROXY (STRENGTHENED) ---------------- */
  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop);
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (["get", "monster"].includes(key.toLowerCase())) return getMonster;
      
      if (cache[key]) return cache[key];

      // Async loading logic for any other property access
      const loader = getMonster(key).then(m => {
          cache[key] = m;
          return m;
      });

      return new Proxy({ _loader: loader }, {
          get(target, sub) {
              return async (...args) => {
                  const real = await target._loader;
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
