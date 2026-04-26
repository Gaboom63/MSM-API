(function (global) {
  let COMMIT_HASH = localStorage.getItem('msm_api_hash') || 'main'; 
  let BASE_URL, IMAGE_BASE_URL, SOUND_BASE_URL, ELEMENTS_URL, BREEDING_FILE_PATH, MASTER_DB_URL;

  function updateUrls() {
    BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/`;
    MASTER_DB_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/master_database.json`;
    IMAGE_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/bm/`;
    SOUND_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/sounds/`;
    ELEMENTS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/images/elements/`;
    BREEDING_FILE_PATH = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/JSONS/breedingCombos.json`;
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
          
          if (oldHash && oldHash !== 'main') {
              Object.keys(localStorage).forEach(key => {
                  if (key.startsWith('msm_') && key.includes(oldHash)) {
                      localStorage.removeItem(key);
                  }
              });
          }
          
          console.log(`MSM API Update detected! Switched from ${oldHash ? oldHash.substring(0,7) : 'main'} to ${COMMIT_HASH.substring(0,7)}`);
      }
      localStorage.setItem('msm_hash_last_check', now);
    } catch (err) { console.warn("GitHub API Sync failed, using cached hash."); }
    finally { updateUrls(); }
  }

  updateUrls();
  const syncPromise = syncToLatestCommit();

  const cache = {}; 
  const fetchPromises = {};
  let dbCache = null;

  async function fetchWithCache(storageKey, url) {
    if (cache[storageKey]) return cache[storageKey];
    if (fetchPromises[storageKey]) return fetchPromises[storageKey];

    const versionedKey = `msm_${COMMIT_HASH}_${storageKey}`;
    
    try {
        const saved = localStorage.getItem(versionedKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            cache[storageKey] = parsed;
            return parsed;
        }
    } catch (e) {
        console.warn(`Failed to read from LocalStorage for ${storageKey}`);
    }

    const fetchPromise = (async () => {
        try {
            const res = await fetch(url, { credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            const data = await res.json();
            cache[storageKey] = data; 
            try {
                localStorage.setItem(versionedKey, JSON.stringify(data));
            } catch (storageErr) {
                console.warn("LocalStorage is full! Proceeding with in-memory cache.");
            }
            return data;
        } catch (e) { 
            return null; 
        } finally {
            delete fetchPromises[storageKey];
        }
    })();

    fetchPromises[storageKey] = fetchPromise;
    return fetchPromise;
  }

  async function initDatabases() {
    await syncPromise;
    if (dbCache) return dbCache;

    dbCache = await fetchWithCache('master_db', MASTER_DB_URL);
    return dbCache || {};
  }

  let breedingCache = null;
  let nameRegistry = {};
  
  async function getBreedingDatabase() {
    await initDatabases();
    if (breedingCache) return breedingCache;
    
    const rawData = dbCache['breedingCombos'] || await fetchWithCache('breeding_db', BREEDING_FILE_PATH);
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
    breedingCache._rawDict = rawData; 
    
    return processed;
  }

  function resolveMonsterPath(rawName, dbCacheRef) {
      const lowerName = rawName.trim().toLowerCase();
      let folder = "Common", baseNameClean = rawName.trim();

      if (lowerName.startsWith("rare ")) { 
          folder = "Rare"; baseNameClean = rawName.substring(5).trim(); 
      } else if (lowerName.startsWith("epic ")) { 
          folder = "Epic"; baseNameClean = rawName.substring(5).trim(); 
      }

      if (baseNameClean.toLowerCase() === "gnarl") baseNameClean = "Gnarls";

      if (dbCacheRef && dbCacheRef['Image Manifest']) {
          const exactKey = Object.keys(dbCacheRef['Image Manifest']).find(k => k.toLowerCase() === baseNameClean.toLowerCase());
          if (exactKey) {
              baseNameClean = exactKey;
          }
      }

      const fileName = (baseNameClean.charAt(0).toUpperCase() + baseNameClean.slice(1));
      return { folder, file: fileName, baseNameClean };
  }

  async function getMonster(name) {
    await initDatabases();
    
    const { folder: rarity, file, baseNameClean } = resolveMonsterPath(name, dbCache);
    const fullName = rarity === "Common" ? baseNameClean : `${rarity} ${baseNameClean}`;

    if (rarity !== "Common") {
        const hasImage = dbCache['Image Manifest']?.[baseNameClean]?.[rarity];
        const hasTime = dbCache['Breeding Times']?.[baseNameClean]?.[rarity];
        const hasCost = dbCache['Costs']?.[fullName];
        const hasWublin = dbCache['Wublins']?.[baseNameClean]?.[rarity];
        
        // Relaxed Kill Switch: Allows monsters to load if they have at least *some* database presence
        if (!hasImage && !hasTime && !hasCost && !hasWublin) {
            return null; 
        }
    }

    const descObj = dbCache['Descriptions']?.[fullName] || dbCache['Descriptions']?.[baseNameClean];
    const description = descObj ? descObj.description : "Description unavailable.";

    const costObj = dbCache['Costs']?.[fullName] || dbCache['Costs']?.[baseNameClean] || {};
    const primaryCost = costObj.coin_cost || costObj.diamond_cost || costObj.relic_cost || "N/A";

    const imageManifest = dbCache['Image Manifest']?.[baseNameClean]?.[rarity] || {};
    let finalImageUrl = imageManifest.full_image 
        ? `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}${encodeURI(imageManifest.full_image)}`
        : `${IMAGE_BASE_URL}${encodeURIComponent(file)}.png`;

    if (!descObj && !Object.keys(costObj).length && !imageManifest.full_image) {
        return null;
    }

    const elementObj = dbCache['Elements']?.[baseNameClean];
    let elements = elementObj ? (elementObj.Element || elementObj.elements || []) : [];

    const elementImageDb = dbCache['Element Image Manifest'] || {};
    const elementsResolved = elements.map(elName => {
        const normalized = elName.toLowerCase().replace(/\s+/g, "-");
        const elFile = elementImageDb[elName] || elementImageDb[normalized] || elementImageDb[`${normalized}-element`];
        return {
            name: elName,
            image: elFile ? `${ELEMENTS_URL}${encodeURIComponent(elFile)}` : null
        };
    });

    const breedingTimes = dbCache['Breeding Times']?.[baseNameClean]?.[rarity] || null;
    const likes = dbCache['Likes']?.[baseNameClean]?.[rarity] || [];
    const islandsList = dbCache['Islands']?.[fullName] || dbCache['Islands']?.[baseNameClean] || [];
    const inventory = dbCache['Celestials']?.[fullName]?.Inventory || dbCache['Wublins']?.[baseNameClean]?.[rarity]?.Inventory || null;

    const rawCostumes = dbCache['Costumes']?.[baseNameClean]?.[rarity] || [];
    const costumes = rawCostumes.map(c => `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${rarity}/${encodeURIComponent(baseNameClean)}/${encodeURIComponent(c)}`);

    const rawSounds = dbCache['Sounds']?.[baseNameClean]?.[rarity] || [];
    const sounds = rawSounds.map(s => `${SOUND_BASE_URL}${rarity}/${encodeURIComponent(baseNameClean)}/${encodeURIComponent(s)}`);

    return {
        name: fullName,
        baseName: baseNameClean,
        rarity: rarity,
        description: description,
        costs: costObj,
        cost: primaryCost,
        imageUrl: finalImageUrl,
        eggUrl: imageManifest.egg_image ? `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}${encodeURI(imageManifest.egg_image)}` : null,
        elements: elements,
        elementsResolved: elementsResolved,
        islands: islandsList,
        inventory: inventory,
        likes: likes,
        costumes: costumes,
        _costumeIndex: costumes.length,
        sounds: sounds,
        breedingTimes: breedingTimes,
        
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
          const list = this.islands.map(i => i.toLowerCase());
          return list.includes(islandName.toLowerCase())
            ? `${this.name} is on ${islandName}!`
            : `${this.name} is not on ${islandName}.`;
        },
        
        getInfo() { return `${this.name} (${this.rarity}) costs ${this.cost}.`; },
        
        async getBreedingTime() {
          return this.breedingTimes || { Standard: "Unknown", Enhanced: "Unknown", Standard_Skin: "Unknown", Enhanced_Skin: "Unknown" };
        },

        async getBreedingCombos() {
          const db = await getBreedingDatabase();
          const rawDict = db._rawDict || {}; 
          const searchName = this.name.toLowerCase();
          let combos = [];
          
          for (const [comboKey, results] of Object.entries(rawDict)) {
              if (comboKey.includes("+") && Array.isArray(results)) {
                  if (results.some(r => r.toLowerCase() === searchName)) {
                      combos.push(comboKey);
                  }
              }
          }
          
          return [...new Set(combos)].map(c => 
              c.split('+')
               .map(p => p.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
               .join(' + ')
          );
        },
        
        getStatistics() { return { name: this.name, rarity: this.rarity, costs: this.costs, description: this.description }; },
        getSounds() { return this.sounds; },

        async playSound(index = 0) {
          if (!this.sounds || this.sounds.length === 0) return console.warn(`No sounds found for ${this.name}`);
          try {
            const trackIndex = index < this.sounds.length ? index : 0; 
            const audio = new Audio(this.sounds[trackIndex]);
            audio.crossOrigin = "anonymous";
            await audio.play();
          } catch {
            console.warn(`Failed to play sound for ${this.name}`);
          }
        }
    };
  }

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
        if (sub === "then") return target._loader.then.bind(target._loader);
        if (sub === "catch") return target._loader.catch.bind(target._loader);
        if (sub === "finally") return target._loader.finally.bind(target._loader);

        return async (...args) => {
          const real = await target._loader;
          if (!real) return null; 
          const val = real[sub];
          if (typeof val === "function") {
              const result = val.apply(real, args);
              return result instanceof Promise ? await result : result;
          }
          return val;
        };
      }
    });
  }
});

  if (typeof module !== "undefined" && module.exports) module.exports = MSM;
  else global.MSM = MSM;

})(this);