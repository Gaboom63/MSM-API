(function (global) {
  /* ---------------- CONFIG & PERSISTENT CACHE ---------------- */
  let COMMIT_HASH = localStorage.getItem('msm_api_hash') || 'main'; 
  let BASE_URL, IMAGE_BASE_URL, SOUND_BASE_URL, ELEMENTS_URL, BREEDING_FILE_PATH, COSTUME_INDEX_URL, ELEMENT_INDEX_URL, SOUND_INDEX_URL;

  function updateUrls() {
    BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/monsters/`;
    IMAGE_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/bm/`;
    SOUND_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/sounds/`;
    ELEMENTS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/elements/`;
    BREEDING_FILE_PATH = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/monsters/Extras/breedingCombos.json`;
    COSTUME_INDEX_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes.json`;
    ELEMENT_INDEX_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/elements.json`;
    SOUND_INDEX_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/sounds.json`;
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
    
    // Only check GitHub API once every 10 minutes to prevent rate limiting
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
          
          // Cleanup routine to delete old versioned data from LocalStorage
          Object.keys(localStorage).forEach(key => {
              if (key.startsWith('msm_') && key.includes(oldHash)) {
                  localStorage.removeItem(key);
              }
          });
          
          console.log(`MSM API Update detected! Switched from ${oldHash.substring(0,7)} to ${COMMIT_HASH.substring(0,7)}`);
      }
      localStorage.setItem('msm_hash_last_check', now);
    } catch (err) { console.warn("GitHub API Sync failed, using cached hash."); }
    finally { updateUrls(); }
  }

  updateUrls();
  const syncPromise = syncToLatestCommit();

  const cache = {}; 
  let breedingCache = null;
  let costumeCache = null;
  let elementCache = null;
  let soundCache = null;
  let nameRegistry = {};
  const fetchPromises = {}; // Prevents overlapping duplicate network requests

  /* ---------------- HELPERS ---------------- */
  async function fetchWithCache(storageKey, url) {
    // 1. Check in-memory cache first
    if (cache[storageKey]) return cache[storageKey];
    
    // 2. If a request for this URL is already in progress, wait for it instead of firing a new one
    if (fetchPromises[storageKey]) return fetchPromises[storageKey];

    const versionedKey = `msm_${COMMIT_HASH}_${storageKey}`;
    
    // 3. Check LocalStorage (wrapped safely)
    try {
        const saved = localStorage.getItem(versionedKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            cache[storageKey] = parsed;
            return parsed;
        }
    } catch (e) {
        console.warn(`Failed to read from LocalStorage for ${storageKey}`, e);
    }

    // 4. Create and store the fetch promise
    const fetchPromise = (async () => {
        try {
            const res = await fetch(url, { credentials: 'omit' });
            
            // CRITICAL: Ensure the response is actually valid before parsing JSON
            if (!res.ok) {
                throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
            }
            
            const data = await res.json();
            cache[storageKey] = data; // Save to in-memory cache

            // CRITICAL: Isolate LocalStorage writing. If it fails (Quota Exceeded), 
            // the app keeps working using the in-memory cache instead of breaking.
            try {
                localStorage.setItem(versionedKey, JSON.stringify(data));
            } catch (storageErr) {
                console.warn("LocalStorage is full! Proceeding with in-memory cache.", storageErr);
            }

            return data;
        } catch (e) { 
            console.error(`Fetch failed for ${url}:`, e);
            return null; 
        } finally {
            // Cleanup the promise from the tracker once finished
            delete fetchPromises[storageKey];
        }
    })();

    fetchPromises[storageKey] = fetchPromise;
    return fetchPromise;
  }
  /* ---------------- ELEMENTS ---------------- */
  let elementDbPromise = null;
  
  async function getElementDatabase() {
    await syncPromise;
    if (elementCache) return elementCache;

    if (!elementDbPromise) {
        elementDbPromise = fetchWithCache('elements_db', ELEMENT_INDEX_URL).then(data => {
            elementCache = data || {};
            return elementCache;
        });
    }
    return elementDbPromise;
  }

  function normalizeElementName(name) { return name.toLowerCase().replace(/\s+/g, "-"); }

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
    const safeRarity = rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase() : "Common";
    const cleanName = monsterName.replace(/^(rare|epic)\s+/i, "").trim().replace(/^Adult\s+/i, "");
    
    const entry = db?.[cleanName];
    if (!entry || !Array.isArray(entry[safeRarity])) return [];
    
    const basePath = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${safeRarity}/${encodeURIComponent(cleanName)}/`;
    return entry[safeRarity].map(file => `${basePath}${encodeURIComponent(file)}`);
  }

  /* ---------------- SOUNDS ---------------- */
  async function getSoundDatabase() {
    await syncPromise;
    if (soundCache) return soundCache;
    soundCache = await fetchWithCache('sounds_db', SOUND_INDEX_URL);
    return soundCache || {};
  }

  async function resolveSounds(monsterName, rarity = "Common") {
    const db = await getSoundDatabase();
    const safeRarity = rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase() : "Common";
    const cleanName = monsterName.replace(/^(rare|epic)\s+/i, "").trim().replace(/^Adult\s+/i, "");
    
    const entry = db?.[cleanName];
    if (!entry || !Array.isArray(entry[safeRarity])) return [];
    
    const basePath = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/sounds/${safeRarity}/${encodeURIComponent(cleanName)}/`;
    return entry[safeRarity].map(file => `${basePath}${encodeURIComponent(file)}`);
  }

  /* ---------------- PATH RESOLVER ---------------- */
  function resolveMonsterPath(rawName) {
      const lowerName = rawName.trim().toLowerCase();
      let folder = "Common", baseNameClean = rawName.trim();

      if (lowerName.startsWith("rare ")) { 
          folder = "Rare"; baseNameClean = rawName.substring(5).trim(); 
      } else if (lowerName.startsWith("epic ")) { 
          folder = "Epic"; baseNameClean = rawName.substring(5).trim(); 
      }

      const registryKey = baseNameClean.toLowerCase();
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

  /* ---------------- MAIN FETCH ---------------- */
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
      const sounds = await resolveSounds(data.name, folder);

      /* --- PRELOAD ELEMENTS --- */
      const elementDb = await getElementDatabase();
      const rawEls = data.element || data.elements || [];
      let elements = Array.isArray(rawEls) ? rawEls.flat() : [];

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

      const elementsResolved = elements.map(el => {
        const elName = typeof el === "object" ? (el.name || el.id) : el;
        const normalized = normalizeElementName(elName);
        const elFile = elementDb[elName] || elementDb[elName.toLowerCase()] || elementDb[normalized] || elementDb[`${normalized}-element`];

        return {
          name: elName,
          image: elFile ? `${ELEMENTS_URL}${encodeURIComponent(elFile)}` : null
        };
      });

      /* ---------------- RETURN OBJECT ---------------- */
      return {
        ...data,
        rarity: folder,
        imageUrl: finalImageUrl,
        costumes,
        _costumeIndex: costumes.length,
        elementsResolved,
        sounds,
        
        getElementImages() { return this.elementsResolved; },
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
        
        resetCostumes() {
          this._costumeIndex = this.costumes.length;
          return this.imageUrl;
        },
        
        async loadImage(selector) {
          const el = document.getElementById(selector) || document.querySelector(`.${selector}`);
          if (el) el.src = this.imageUrl;
        },
        
        isOnIsland(islandName) {
          const list = (data.islands || []).map(i => i.toLowerCase());
          return list.includes(islandName.toLowerCase())
            ? `${data.name} is on ${islandName}!`
            : `${data.name} is not on ${islandName}.`;
        },
        
        getInfo() { return `${data.name} (${folder}) costs ${data.cost || 'N/A'}.`; },
        
        async getBreedingTime() {
          if (!data.breedingTime || data.breedingTime.length === 0) return { breedingTime: "Unknown", enhancedTime: "Unknown" };
          const [breeding, enhanced] = data.breedingTime[0].includes(", ") ? data.breedingTime[0].split(", ") : [data.breedingTime[0], "Unknown"];
          return { breedingTime: breeding.replace("Breeding Time: ", ""), enhancedTime: enhanced.replace("Enhanced Time: ", "") };
        },
        
        async getBreedingCombos() { return data.breedingCombo; },
        getStatistics() { return { ...data, rarity: folder }; },
        getSounds() { return this.sounds; },

        async playSound(index = 0) {
          if (!this.sounds || this.sounds.length === 0) {
            console.warn(`No sounds found for ${data.name}`);
            return;
          }
          try {
            // Allows playing alternate sounds if the monster has more than one
            const trackIndex = index < this.sounds.length ? index : 0; 
            const audio = new Audio(this.sounds[trackIndex]);
            audio.crossOrigin = "anonymous";
            await audio.play();
          } catch {
            console.warn(`Failed to play sound for ${data.name}`);
          }
        }
      };

    } catch (err) { return null; }
  }

  /* ---------------- PROXY MAPPER ---------------- */
  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop);
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (["get", "monster"].includes(key.toLowerCase())) return getMonster;
      
      if (cache[key]) return cache[key];

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