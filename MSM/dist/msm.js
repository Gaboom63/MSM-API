(function (global) {
  let COMMIT_HASH = localStorage.getItem('msm_api_hash') || 'main'; 
  let BASE_URL, IMAGE_BASE_URL, SOUND_BASE_URL, ELEMENTS_URL, BREEDING_FILE_PATH, MASTER_DB_URL, MONSTERS_URL, DOF_MONSTERS_URL;
  
  const LOCAL_MODE = false;

  function updateUrls() {
          if (LOCAL_MODE) {
            // Local relative paths stepping out of MSM-Combo-Finder directly into MSM / MSM-DOF
            BASE_URL = `/MSM-API/MSM/data/`;
            MASTER_DB_URL = `/MSM-API/MSM/data/master_database.json`;
            MONSTERS_URL = `/MSM-API/MSM/data/Monsters/`;
            DOF_MONSTERS_URL = `/MSM-API/MSM-DOF/data/Monsters/`; 
            IMAGE_BASE_URL = `/MSM-API/MSM/images/bm/`;
            SOUND_BASE_URL = `/MSM-API/MSM/data/sounds/`;
            ELEMENTS_URL = `/MSM-API/MSM/images/elements/`;
            BREEDING_FILE_PATH = `/MSM-API/MSM/data/breedingCombos.json`;
          } else {
              // Production GitHub CDN paths
              BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/`;
              MASTER_DB_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/master_database.json`;
              MONSTERS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/Monsters/`;
              DOF_MONSTERS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM-DOF/data/Monsters/`;
              IMAGE_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/images/bm/`;
              SOUND_BASE_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/sounds/`;
              ELEMENTS_URL = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/images/elements/`;
              BREEDING_FILE_PATH = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/breedingCombos.json`;
          }
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
          // If testing locally, we don't care about the GitHub commit sync.
          if (LOCAL_MODE) {
              updateUrls();
              return;
          }

          // CHANGED: Use sessionStorage so a new session/tab always checks for the latest commit
          const lastCheck = sessionStorage.getItem('msm_hash_last_check') || 0;
          const now = Date.now();
          
          // CHANGED: Reduced from 600000 (10 mins) to 60000 (1 min).
          // This allows quick updates on reload while preventing GitHub rate limiting (60 req/hr).
          if (now - lastCheck < 60000 && COMMIT_HASH !== 'main') {
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
              // CHANGED: Save the new check time to sessionStorage
              sessionStorage.setItem('msm_hash_last_check', now);
          } catch (err) { 
              console.warn("GitHub API Sync failed, using cached hash."); 
          } finally { 
              updateUrls(); 
          }
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
    breedingCache._rawDict = rawData; 
    
    return processed;
  }

  async function calculateBreeding(comboString) {
      const db = await getBreedingDatabase();
      if (!comboString || !comboString.includes("+")) return ["Invalid format"];
      const searchKey = comboString.split("+").map(s => s.trim().toLowerCase()).sort().join(" + ");
      return db[searchKey] || ["No combination found."];
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

  async function getMonster(rawName) {
        try {
            await initDatabases();
            
            const { folder: rarity, file, baseNameClean } = resolveMonsterPath(rawName, dbCache);
            let fullName = rawName.trim();
            
            let dataFolderName = fullName;
            if (fullName.includes("(Major)")) {
                dataFolderName = fullName.replace(" (Major)", "").trim();
            } else if (fullName.includes("(Minor)")) {
                dataFolderName = fullName.replace(" (Minor)", "").trim();
            }

            if (dbCache && dbCache['Image Manifest']) {
                const exactFolder = Object.keys(dbCache['Image Manifest']).find(k => k.toLowerCase() === dataFolderName.toLowerCase());
                if (exactFolder) {
                    dataFolderName = exactFolder;
                }
            }

            const safeFolderName = dataFolderName.replace(/\//g, "-").replace(/:/g, "");
            const dedicatedDataUrl = `${MONSTERS_URL}${encodeURIComponent(safeFolderName)}/data.json`;
            
            let mData = await fetchWithCache(`monster_data_${safeFolderName}`, dedicatedDataUrl);
            
            if (!mData || Object.keys(mData).length === 0) {
                console.warn(`No dedicated data.json found for monster: ${dataFolderName}`);
                return null;
            }

            const descObj = mData.Description || null;
            const description = descObj ? descObj.description : "Description unavailable.";
            const costObj = mData.Costs || {};
            
            const primaryCost = Object.values(costObj).find(val => {
                if (typeof val === 'string') {
                    const vLow = val.toLowerCase();
                    if (vLow === fullName.toLowerCase() || vLow === baseNameClean.toLowerCase() || vLow === dataFolderName.toLowerCase()) {
                        return false;
                    }
                }
                return true;
            }) || "N/A";

            const finalImageUrl = `${IMAGE_BASE_URL}${encodeURIComponent(fullName)}.png`;
            const eggName = fullName.replace(/\s*\((Major|Minor)\)/i, "").trim();
            // Assuming monster eggs live under the main CDN, adjust path if they are in a different repo
            const finalEggUrl = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/images/monster_eggs/${encodeURIComponent(eggName)}.png`;

            const elementImageDb = dbCache['Element Image Manifest'] || {};
            const elementsResolved = (mData.Elements || []).map(elName => {
                const normalized = String(elName).toLowerCase().replace(/\s+/g, "-");
                const elFile = elementImageDb[elName] || elementImageDb[normalized] || elementImageDb[`${normalized}-element`];
                return {
                    name: String(elName),
                    image: elFile ? `${ELEMENTS_URL}${encodeURIComponent(elFile)}` : null
                };
            });

            const rawCostumes = Array.isArray(dbCache['Costumes']?.[baseNameClean]?.[rarity]) ? dbCache['Costumes'][baseNameClean][rarity] : [];
            const costumes = rawCostumes.map(c => `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/data/costumes/${rarity}/${encodeURIComponent(baseNameClean)}/${encodeURIComponent(c)}`);

            const rawSounds = Array.isArray(dbCache['Sounds']?.[baseNameClean]?.[rarity]) ? dbCache['Sounds'][baseNameClean][rarity] : [];
            const sounds = rawSounds.map(s => `${SOUND_BASE_URL}${rarity}/${encodeURIComponent(baseNameClean)}/${encodeURIComponent(s)}`);

            return {
                name: fullName,
                baseName: baseNameClean,
                rarity: rarity,
                description: description,
                costs: costObj,
                cost: primaryCost,
                imageUrl: finalImageUrl,
                eggUrl: finalEggUrl,
                elements: mData.Elements || [],
                elementsResolved: elementsResolved,
                islands: mData.Islands || [],
                inventory: mData["Celestial Inventory"] || mData["Wublin Inventory"] || null,
                likes: mData.Likes || [],
                costumes: costumes,
                _costumeIndex: costumes.length,
                sounds: sounds,
                breedingTimes: mData["Breeding Times"] || null,
                
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
                    if (el) {
                        // Stop large images from blocking the main thread during render
                        el.decoding = "async";
                        // Tell the browser to prioritize this download over other background assets
                        el.fetchPriority = "high";
                        el.src = this.imageUrl;
                    }
                },
                isOnIsland(islandName) {
                    return (this.islands.map(i => String(i).toLowerCase()).includes(islandName.toLowerCase()))
                        ? `${this.name} is on ${islandName}!`
                        : `${this.name} is not on ${islandName}.`;
                },
                getInfo() { return `${this.name} (${this.rarity}) costs ${this.cost}.`; },
                async getBreedingTime() { return this.breedingTimes || { Standard: "Unknown", Enhanced: "Unknown" }; },
                
                async getBreedingCombos() { 
                    const db = await getBreedingDatabase();
                    const rawDict = db._rawDict || {};
                    const matches = [];
                    
                    const targetName = fullName.toLowerCase();
                    
                    for (const [parents, offsprings] of Object.entries(rawDict)) {
                        if (parents.includes("+") && Array.isArray(offsprings)) {
                            const producesMe = offsprings.some(child => child.toLowerCase() === targetName);
                            if (producesMe) {
                                matches.push(parents);
                            }
                        }
                    }
                    
                    if (matches.length > 0) return matches;

                    if (mData["Combinations to Breed"] && mData["Combinations to Breed"].length > 0) {
                        return mData["Combinations to Breed"];
                    }
                    
                    return [];
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
                    } catch { console.warn(`Failed to play sound for ${this.name}`); }
                }
            };
        } catch (criticalError) {
            console.error(`Catastrophic failure parsing JSON for ${rawName}:`, criticalError);
            return null;
        }
  }

  async function getDofMonster(rawName) {
      try {
          const folderName = rawName.trim();
          const safeFolderName = folderName.replace(/\//g, "-").replace(/:/g, "");
          const dedicatedDataUrl = `${DOF_MONSTERS_URL}${encodeURIComponent(safeFolderName)}/data.json`;
          
          let mData = await fetchWithCache(`dof_monster_data_${safeFolderName}`, dedicatedDataUrl);
          
          if (!mData || Object.keys(mData).length === 0) {
              console.warn(`No dedicated DOF data.json found for: ${dedicatedDataUrl}`);
              return null;
          }

          return {
              name: folderName,
              breedingTimes: mData["Breeding Times"] || { Standard: "Unknown", Enhanced: "Unknown" },
              prismatics: mData["Prismatics"] || [], // New field
              async getBreedingTime() { 
                  return this.breedingTimes; 
              }
          };
      } catch (error) {
          console.error(`Failed parsing DOF JSON for ${rawName}:`, error);
          return null;
      }
  }
 
  async function getIslandImg(identifier) {
        await initDatabases();
        
        const islandsImages = dbCache['Island Manifest'] || {};
        
        let normalized = identifier.toLowerCase().trim().replace(/\s+/g, '_');
        if (!normalized.endsWith('_island') && !normalized.includes('colossingum')) {
            normalized += '_island';
        }

        const matches = islandsImages[normalized];
        if (!matches) return null;

        const islandBaseUrl = `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/MSM/`;
        return matches.map(path => `${islandBaseUrl}${encodeURI(path)}`);
  }

  async function fetchIslands() {
      await initDatabases();
      const dbIslands = dbCache['Islands'] || {};
      const uniqueIslands = new Set();

      for (const islandArray of Object.values(dbIslands)) {
          if (Array.isArray(islandArray)) {
              islandArray.forEach(island => uniqueIslands.add(island));
          }
      }

      return Array.from(uniqueIslands).sort();
    }

    // THE FIXED FETCH ISLAND FUNCTION
    async function fetchIsland(identifier) {
        await initDatabases();
        const dbIslands = dbCache['Islands'] || {};
        
        let searchTarget = identifier.toLowerCase().trim();
        
        // Handle UI Dropdown Aliases
        if (searchTarget === 'haven') searchTarget = 'haven';
        if (searchTarget === 'oasis') searchTarget = 'oasis';
        if (searchTarget === 'sanctum') searchTarget = 'sanctum';
        if (searchTarget === 'nexus') searchTarget = 'nexus';

        let actualIslandName = identifier;
        const roster = [];
        let found = false;
    
        for (const [monsterName, islandArray] of Object.entries(dbIslands)) {
            if (!Array.isArray(islandArray)) continue;
            
            for (const islandName of islandArray) {
                const normalizedIsland = String(islandName).toLowerCase().trim();
                
                // Allow flexible matching (exact, appended "island", or matching the UI alias)
                if (
                    normalizedIsland === searchTarget || 
                    normalizedIsland === searchTarget + " island" || 
                    normalizedIsland + " island" === searchTarget ||
                    (normalizedIsland.includes(searchTarget) && searchTarget.length > 3)
                ) {
                    roster.push(monsterName);
                    actualIslandName = islandName; 
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            return { error: `No data found for island matching '${identifier}'.` };
        }

        const images = await getIslandImg(actualIslandName) || [];

        return {
            name: actualIslandName,
            images: images,
            monsters: roster.sort(),
            totalMonsters: roster.length,

            getImages() { return this.images; },
            getMonsters() { return this.monsters; },
            getInfo() { return `${this.name} features ${this.totalMonsters} known monsters!`; }
        };
    }
    
  const MSM = new Proxy({}, {
  get(target, prop) {
    const key = String(prop);

    if (key === "getDofBaseUrl") return () => DOF_MONSTERS_URL;
    if (key === "twoMonsterCombo") return calculateBreeding;
    if (key === "getIslandImg") return getIslandImg;
    if (key === "fetchIsland" || key === "island") return fetchIsland;
    if (key === "fetchIslands" || key === "islands") return fetchIslands;
    if (["get", "monster"].includes(key.toLowerCase())) return getMonster;
    if (["getdofmonster", "dofmonster"].includes(key.toLowerCase())) return getDofMonster; 
    if (key === "help") {
        return () => {
            console.log(`
    🎵 MSM API
    ──────────────────────────────────
    Version: ${COMMIT_HASH.substring(0, 7)}
    Mode: ${LOCAL_MODE ? "Local" : "CDN"}

    Monster Methods
    ---------------
    await MSM.get("Entbrat")
    await MSM.monster("Rare Noggin")

    Breeding
    --------
    await MSM.twoMonsterCombo("Mammott + Toe Jammer")

    Islands
    -------
    await MSM.fetchIsland("Plant")
    await MSM.fetchIslands()

    DOF
    ---
    await MSM.getDofMonster("Mammott")

    GitHub
    ------
    https://github.com/Gaboom63/MSM-API
            `);

            return {
                version: COMMIT_HASH,
                mode: LOCAL_MODE ? "Local" : "CDN"
            };
        };
    }
    if (key in cache) return cache[key];

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

// Thanks for using my API :)
