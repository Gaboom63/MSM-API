(function (global) {
  const REPO = 'Gaboom63/MSM-API';
  const LOCAL_MODE = false;

  const SHA_RE = /^[0-9a-f]{40}$/i;
  const CACHE_KEY_RE = /^msm_(main|[0-9a-f]{40})_/i;
  const CHECK_INTERVAL_MS = 10 * 60 * 1000; // how often we ask GitHub for the newest commit
  const RETRY_INTERVAL_MS = 2 * 60 * 1000;  // back-off after a failed check (e.g. rate limited)

  // localStorage can throw (private mode, sandboxed iframes) or not exist (Node) - never let that crash the API.
  const store = {
    get(key) { try { return global.localStorage ? global.localStorage.getItem(key) : null; } catch (e) { return null; } },
    set(key, value) { try { if (global.localStorage) global.localStorage.setItem(key, value); } catch (e) {} },
    remove(key) { try { if (global.localStorage) global.localStorage.removeItem(key); } catch (e) {} },
    keys() { try { return global.localStorage ? Object.keys(global.localStorage) : []; } catch (e) { return []; } }
  };

  const storedHash = store.get('msm_api_hash');
  let COMMIT_HASH = SHA_RE.test(storedHash || '') ? storedHash : 'main';
  let ROOT_URL, BASE_URL, IMAGE_BASE_URL, SOUND_BASE_URL, ELEMENTS_URL, BREEDING_FILE_PATH, MASTER_DB_URL, MONSTERS_URL, DOF_MONSTERS_URL, NEWS_IMAGES_URL, NEWS_IMAGES_INDEX_URL;

  // Track the currently playing audio across the entire API to prevent overlap
  let currentPlayingAudio = null;

  function updateUrls() {
    if (LOCAL_MODE) {
      console.log("LOADING LOCAL MODE!");
      ROOT_URL = `/MSM-API/MSM/`;
      BASE_URL = `/MSM-API/MSM/data/`;
      MASTER_DB_URL = `/MSM-API/MSM/data/master_database.json`;
      MONSTERS_URL = `/MSM-API/MSM/data/Monsters/`;
      DOF_MONSTERS_URL = `/MSM-API/MSM-DOF/data/Monsters/`;
      IMAGE_BASE_URL = `/MSM-API/MSM/images/bm/`;
      SOUND_BASE_URL = `/MSM-API/MSM/data/sounds/`;
      ELEMENTS_URL = `/MSM-API/MSM/images/elements/`;
      BREEDING_FILE_PATH = `/MSM-API/MSM/data/breedingCombos.json`;
      NEWS_IMAGES_URL = `/MSM-API/MSM/images/sales/`;
      NEWS_IMAGES_INDEX_URL = `/MSM-API/MSM/images/sales/index.json`;
    } else {
      const cdn = `https://cdn.jsdelivr.net/gh/${REPO}@${COMMIT_HASH}/`;
      ROOT_URL = `${cdn}MSM/`;
      BASE_URL = `${ROOT_URL}data/`;
      MASTER_DB_URL = `${BASE_URL}master_database.json`;
      MONSTERS_URL = `${BASE_URL}Monsters/`;
      DOF_MONSTERS_URL = `${cdn}MSM-DOF/data/Monsters/`;
      IMAGE_BASE_URL = `${ROOT_URL}images/bm/`;
      SOUND_BASE_URL = `${BASE_URL}sounds/`;
      ELEMENTS_URL = `${ROOT_URL}images/elements/`;
      BREEDING_FILE_PATH = `${BASE_URL}breedingCombos.json`;
      NEWS_IMAGES_URL = `${ROOT_URL}images/sales/`;
      NEWS_IMAGES_INDEX_URL = `${NEWS_IMAGES_URL}index.json`;
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

  // Remove cached data that belongs to old commits (only touches keys this API created).
  function pruneStaleCache() {
    if (LOCAL_MODE) return;
    const currentPrefix = `msm_${COMMIT_HASH}_`;
    store.keys().forEach(key => {
      if (!CACHE_KEY_RE.test(key)) return;
      const isMain = key.startsWith('msm_main_');
      if (isMain || (COMMIT_HASH !== 'main' && !key.startsWith(currentPrefix))) store.remove(key);
    });
  }

  async function syncToLatestCommit() {
    if (LOCAL_MODE) {
      updateUrls();
      return;
    }

    const now = Date.now();
    const lastCheck = Number(store.get('msm_hash_last_check')) || 0;
    const lastFail = Number(store.get('msm_hash_last_fail')) || 0;
    const hashKnown = COMMIT_HASH !== 'main';

    // GitHub's unauthenticated API allows only 60 requests/hour per IP, so check sparingly
    // (persisted across tabs/sessions) and back off after a failure instead of retrying every load.
    if ((hashKnown && now - lastCheck < CHECK_INTERVAL_MS) || now - lastFail < RETRY_INTERVAL_MS) {
      updateUrls();
      pruneStaleCache();
      return;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { credentials: 'omit' });
      if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
      const data = await res.json();
      if (!data || !SHA_RE.test(data.sha || '')) throw new Error('Unexpected GitHub API response');

      if (COMMIT_HASH !== data.sha) {
        const oldHash = COMMIT_HASH;
        COMMIT_HASH = data.sha;
        store.set('msm_api_hash', COMMIT_HASH);
        console.log(`MSM API Update detected! Switched from ${oldHash.substring(0, 7)} to ${COMMIT_HASH.substring(0, 7)}`);
      }
      store.set('msm_hash_last_check', String(now));
    } catch (err) {
      store.set('msm_hash_last_fail', String(now));
      console.warn("GitHub API Sync failed, using cached hash.", err && err.message ? err.message : "");
    } finally {
      updateUrls();
      pruneStaleCache();
    }
  }

  // Plain-object caches without a prototype so keys like "constructor" can't collide.
  const cache = Object.create(null);
  const fetchPromises = Object.create(null);
  const missing = new Set(); // per-monster data files that returned 404 this session (avoids refetching)
  let dbCache = null;
  let soundsIndexCache = null;
  let soundsIndexCacheLower = null;
  let costumesIndexCache = null;
  let imageManifestLower = null;
  let initPromise = null;

  updateUrls();
  const syncPromise = syncToLatestCommit().catch(() => {});

  async function fetchWithCache(storageKey, url) {
    if (storageKey in cache) return cache[storageKey];
    if (fetchPromises[storageKey]) return fetchPromises[storageKey];
    if (missing.has(storageKey)) return null;

    // Never persist under the "main" placeholder: it has no version, so it could go stale forever.
    const persist = !LOCAL_MODE && COMMIT_HASH !== 'main';
    const versionedKey = `msm_${COMMIT_HASH}_${storageKey}`;

    if (persist) {
      const saved = store.get(versionedKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          cache[storageKey] = parsed;
          return parsed;
        } catch (e) {
          store.remove(versionedKey);
        }
      }
    }

    const fetchPromise = (async () => {
      try {
        let fetchUrl = url;

        if (LOCAL_MODE) {
          const separator = url.includes('?') ? '&' : '?';
          fetchUrl = `${url}${separator}dev=${Date.now()}`;
        }

        const res = await fetch(fetchUrl, {
          credentials: 'omit',
          cache: LOCAL_MODE ? 'no-store' : 'default'
        });

        if (!res.ok) {
          if (res.status === 404 && /^(dof_)?monster_data_/.test(storageKey)) missing.add(storageKey);
          console.warn(`⚠️ Fetch failed (${res.status}) for URL: ${fetchUrl}`);
          return null;
        }

        const data = await res.json();
        cache[storageKey] = data;
        if (persist) store.set(versionedKey, JSON.stringify(data));
        return data;
      } catch (e) {
        console.error(`❌ Error loading JSON from ${url}:`, e);
        return null;
      } finally {
        delete fetchPromises[storageKey];
      }
    })();

    fetchPromises[storageKey] = fetchPromise;
    return fetchPromise;
  }

  // One shared init promise; if the master DB failed to load, the next call retries instead of staying empty forever.
  function initDatabases() {
    if (!initPromise) {
      initPromise = (async () => {
        await syncPromise;

        const [dbData, soundsData, costumesData] = await Promise.all([
          fetchWithCache('master_db', MASTER_DB_URL),
          fetchWithCache('sounds_index', `${BASE_URL}sounds_index.json`),
          fetchWithCache('costumes_index', `${BASE_URL}costumes_index.json`)
        ]);

        dbCache = dbData || {};
        soundsIndexCache = soundsData || {};
        costumesIndexCache = costumesData || {};

        // Lowercase indexes for case-insensitive lookups (built once, not scanned per call)
        soundsIndexCacheLower = Object.create(null);
        for (const [k, v] of Object.entries(soundsIndexCache)) {
          soundsIndexCacheLower[k.toLowerCase()] = v;
        }
        imageManifestLower = Object.create(null);
        for (const k of Object.keys(dbCache['Image Manifest'] || {})) {
          const lk = k.toLowerCase();
          if (!(lk in imageManifestLower)) imageManifestLower[lk] = k;
        }

        if (!dbData) initPromise = null;
        return dbCache;
      })();
    }
    return initPromise;
  }

  let breedingCache = null;
  let nameRegistry = {};

  async function getBreedingDatabase() {
    await syncPromise; // breeding only needs the commit hash, not the master DB / sounds / costumes
    if (breedingCache) return breedingCache;

    const rawData = await fetchWithCache('breeding_db', BREEDING_FILE_PATH);
    if (!rawData) return {};

    const processed = {};
    Object.keys(rawData).forEach(key => {
      if (!key.includes("+")) nameRegistry[key.toLowerCase()] = key;
      if (key.includes("+")) {
        const parts = key.split("+").map(s => s.trim().toLowerCase());
        const sortedKey = parts.sort().join(" + ");
        const children = Array.isArray(rawData[key]) ? rawData[key] : [];
        processed[sortedKey] = processed[sortedKey] ? [...new Set([...processed[sortedKey], ...children])] : rawData[key];
        children.forEach(child => nameRegistry[String(child).toLowerCase()] = child);
      } else { processed[key.toLowerCase()] = rawData[key]; }
    });
    Object.defineProperty(processed, '_rawDict', { value: rawData, enumerable: false });
    breedingCache = processed;

    return processed;
  }

  async function calculateBreeding(comboString) {
    if (typeof comboString !== 'string' || !comboString.includes("+")) return ["Invalid format"];
    const db = await getBreedingDatabase();
    const searchKey = comboString.split("+").map(s => s.trim().toLowerCase()).sort().join(" + ");
    return db[searchKey] || ["No combination found."];
  }

  const NAME_ALIASES = { gnarl: 'Gnarls' };
  const VARIANT_RE = /\s*\((major|minor)\)\s*$/i;

  // Returns the correctly-cased manifest key for a typed name ("entbrat" -> "Entbrat"), or null.
  function findManifestKey(name) {
    if (!imageManifestLower) return null;
    const lower = String(name).trim().toLowerCase();
    if (imageManifestLower[lower]) return imageManifestLower[lower];
    const alias = NAME_ALIASES[lower];
    return (alias && imageManifestLower[alias.toLowerCase()]) || null;
  }

  function resolveMonsterPath(rawName) {
    const trimmed = rawName.trim();
    const lowerName = trimmed.toLowerCase();
    let folder = "Common", baseNameClean = trimmed;

    if (lowerName.startsWith("rare ")) {
      folder = "Rare"; baseNameClean = trimmed.substring(5).trim();
    } else if (lowerName.startsWith("epic ")) {
      folder = "Epic"; baseNameClean = trimmed.substring(5).trim();
    }

    if (baseNameClean.toLowerCase() === "gnarl") baseNameClean = "Gnarls";

    const exactKey = imageManifestLower && imageManifestLower[baseNameClean.toLowerCase()];
    if (exactKey) baseNameClean = exactKey;

    return { folder, baseNameClean };
  }

  async function getMonster(rawName) {
    if (typeof rawName !== 'string' || !rawName.trim()) {
      console.warn("MSM.get() needs a monster name, e.g. MSM.get(\"Entbrat\").");
      return null;
    }

    try {
      await initDatabases();

      const { folder: rarity, baseNameClean } = resolveMonsterPath(rawName);
      const typedName = rawName.trim();

      // Split off "(Major)"/"(Minor)", canonicalise the casing of the base name against the
      // manifest (the CDN is case-sensitive), then put the suffix back.
      const variantMatch = typedName.match(VARIANT_RE);
      const variant = variantMatch ? ` (${variantMatch[1][0].toUpperCase()}${variantMatch[1].slice(1).toLowerCase()})` : "";
      const typedBase = variantMatch ? typedName.slice(0, variantMatch.index).trim() : typedName;
      const dataFolderName = findManifestKey(typedBase) || typedBase;
      const fullName = dataFolderName + variant;
      const eggName = dataFolderName;

      const safeFolderName = dataFolderName.replace(/\//g, "-").replace(/:/g, "");
      const dedicatedDataUrl = `${MONSTERS_URL}${encodeURIComponent(safeFolderName)}/data.json`;

      const mData = await fetchWithCache(`monster_data_${safeFolderName}`, dedicatedDataUrl);

      if (!mData || Object.keys(mData).length === 0) {
        console.warn(`No dedicated data.json found for monster: ${dataFolderName}`);
        return null;
      }

      const descObj = mData.Description || null;
      const description = (descObj && descObj.description) || "Description unavailable.";
      const costObj = mData.Costs || {};

      const primaryCost = Object.values(costObj).find(val => {
        if (typeof val === 'string') {
          const vLow = val.toLowerCase();
          if (vLow === fullName.toLowerCase() || vLow === baseNameClean.toLowerCase() || vLow === dataFolderName.toLowerCase()) {
            return false;
          }
        }
        return true;
      }) ?? "N/A";

      const finalImageUrl = `${IMAGE_BASE_URL}${encodeURIComponent(fullName)}.png`;
      const finalEggUrl = `${ROOT_URL}images/monster_eggs/${encodeURIComponent(eggName)}.png`;

      const elementImageDb = dbCache['Element Image Manifest'] || {};
      const elementsResolved = (mData.Elements || []).map(elName => {
        const normalized = String(elName).toLowerCase().replace(/\s+/g, "-");
        const elFile = elementImageDb[elName] || elementImageDb[normalized] || elementImageDb[`${normalized}-element`];
        return {
          name: String(elName),
          image: elFile ? `${ELEMENTS_URL}${encodeURIComponent(elFile)}` : null
        };
      });

      // --- COSTUME SYSTEM ---
      // Any costume whose name starts with "MonsterName (" (eggName has Major/Minor stripped).
      let costumes = [];
      if (costumesIndexCache) {
        const searchPrefix = `${eggName} (`.toLowerCase();
        const excludeKeywords = ['all ', 'legacy', 'promo', 'contest', 'teaser', 'extract', 'menu'];

        costumes = Object.entries(costumesIndexCache)
          .filter(([cName]) => {
            const lowerCName = cName.toLowerCase();
            if (!lowerCName.startsWith(searchPrefix)) return false;
            // Filter out group/promo images that accidentally got scraped
            return !excludeKeywords.some(kw => lowerCName.includes(kw));
          })
          .map(([, cPath]) => `${BASE_URL}${cPath}`);
      }

      // --- SOUND SYSTEM ---
      const lowerFullName = fullName.toLowerCase();
      const lowerBaseName = baseNameClean.toLowerCase();

      const soundRelativePath = soundsIndexCache[fullName] ||
                                soundsIndexCache[baseNameClean] ||
                                soundsIndexCacheLower[lowerFullName] ||
                                soundsIndexCacheLower[lowerBaseName];

      const sounds = soundRelativePath ? [`${BASE_URL}${soundRelativePath}`] : [];

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
        _costumeIndex: costumes.length, // index === costumes.length means "base image"
        sounds: sounds,
        breedingTimes: mData["Breeding Times"] || null,

        getElementImages() { return this.elementsResolved; },
        getImageURL() { return this.imageUrl; },
        getCostumes() { return this.costumes; },
        getCostume(index) {
          const n = this.costumes.length;
          if (!n) return this.imageUrl;
          const total = n + 1; // all costumes + the base image
          const raw = Number.isInteger(index) ? index : this._costumeIndex;
          const i = ((raw % total) + total) % total; // wraps negatives too
          return i === n ? this.imageUrl : this.costumes[i];
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
          if (typeof document === 'undefined') return;
          let el = document.getElementById(selector);
          if (!el) {
            try { el = document.querySelector(`.${selector}`); } catch (e) { el = null; }
          }
          if (!el) return console.warn(`loadImage: no element found for "${selector}"`);
          el.decoding = "async";
          el.fetchPriority = "high";
          el.src = this.imageUrl;
        },
        isOnIsland(islandName) {
          const norm = s => String(s).toLowerCase().trim().replace(/\s+island$/, "");
          const target = norm(islandName);
          return this.islands.some(i => norm(i) === target)
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
              const producesMe = offsprings.some(child => String(child).toLowerCase() === targetName);
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
          if (typeof Audio === 'undefined') return console.warn("playSound() only works in a browser.");
          try {
            if (currentPlayingAudio) {
              currentPlayingAudio.pause();
              currentPlayingAudio.currentTime = 0;
            }
            const trackIndex = Number.isInteger(index) && index >= 0 && index < this.sounds.length ? index : 0;
            const audio = new Audio();
            audio.crossOrigin = "anonymous"; // must be set before src, otherwise it is ignored / refetched
            audio.src = this.sounds[trackIndex];
            currentPlayingAudio = audio;
            audio.addEventListener('ended', () => {
              if (currentPlayingAudio === audio) currentPlayingAudio = null;
            }, { once: true });
            await audio.play();
          } catch (error) {
            if (error && error.name === 'AbortError') return; // interrupted by another sound - expected
            console.warn(`Failed to play sound for ${this.name}:`, error);
          }
        }
      };
    } catch (criticalError) {
      console.error(`Failed to build monster "${rawName}":`, criticalError);
      return null;
    }
  }

  async function getDofMonster(rawName) {
    if (typeof rawName !== 'string' || !rawName.trim()) return null;
    try {
      await syncPromise; // make sure we're using the latest commit's URL
      const folderName = rawName.trim();
      const safeFolderName = folderName.replace(/\//g, "-").replace(/:/g, "");
      const dedicatedDataUrl = `${DOF_MONSTERS_URL}${encodeURIComponent(safeFolderName)}/data.json`;

      const mData = await fetchWithCache(`dof_monster_data_${safeFolderName}`, dedicatedDataUrl);

      if (!mData || Object.keys(mData).length === 0) {
        console.warn(`No dedicated DOF data.json found for: ${dedicatedDataUrl}`);
        return null;
      }

      return {
        name: folderName,
        breedingTimes: mData["Breeding Times"] || { Standard: "Unknown", Enhanced: "Unknown" },
        prismatics: mData["Prismatics"] || [],
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
    if (typeof identifier !== 'string' || !identifier.trim()) return null;
    await initDatabases();

    const islandsImages = dbCache['Island Manifest'] || {};

    let normalized = identifier.toLowerCase().trim().replace(/\s+/g, '_');
    if (!normalized.endsWith('_island') && !normalized.includes('colossingum')) {
      normalized += '_island';
    }

    const matches = islandsImages[normalized];
    if (!Array.isArray(matches)) return null;

    return matches.map(path => `${ROOT_URL}${encodeURI(path)}`);
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

  async function fetchIsland(identifier) {
    if (typeof identifier !== 'string' || !identifier.trim()) {
      return { error: "Please provide an island name, e.g. MSM.fetchIsland(\"Plant\")." };
    }
    await initDatabases();
    const dbIslands = dbCache['Islands'] || {};

    const norm = s => String(s).toLowerCase().trim();
    const stripIsland = s => norm(s).replace(/\s+island$/, "");
    const target = norm(identifier);
    const targetCore = stripIsland(identifier);

    // Every distinct island name, once (lowercase -> display name)
    const allIslands = new Map();
    for (const arr of Object.values(dbIslands)) {
      if (!Array.isArray(arr)) continue;
      for (const name of arr) {
        const k = norm(name);
        if (!allIslands.has(k)) allIslands.set(k, String(name));
      }
    }
    const names = Array.from(allIslands.keys());

    // Exact match first (so "Fire" means Fire Island, not Fire Haven + Fire Oasis + ...),
    // and only fall back to partial matching when nothing matches exactly.
    let matched = names.filter(n => n === target || stripIsland(n) === targetCore);
    if (!matched.length && target.length > 3) matched = names.filter(n => n.includes(target));

    if (!matched.length) {
      return { error: `No data found for island matching '${identifier}'.` };
    }

    const matchedSet = new Set(matched);
    const roster = [];
    for (const [monsterName, arr] of Object.entries(dbIslands)) {
      if (Array.isArray(arr) && arr.some(i => matchedSet.has(norm(i)))) roster.push(monsterName);
    }

    const displayNames = matched.map(n => allIslands.get(n));
    const imageLists = await Promise.all(displayNames.map(n => getIslandImg(n)));
    const images = imageLists.flat().filter(Boolean);

    return {
      name: displayNames.length === 1 ? displayNames[0] : identifier.trim(),
      islands: displayNames,
      images: images,
      monsters: roster.sort(),
      totalMonsters: roster.length,

      getImages() { return this.images; },
      getMonsters() { return this.monsters; },
      getInfo() { return `${this.name} features ${this.totalMonsters} known monsters!`; }
    };
  }

  async function fetchNewsImages() {
    await syncPromise;

    const files = await fetchWithCache('news_images', NEWS_IMAGES_INDEX_URL);

    if (!Array.isArray(files)) {
      return [];
    }

    return files
      .filter(file => typeof file === 'string')
      .filter(file => /\.(png|jpe?g|gif|webp)$/i.test(file))
      .map(file => `${NEWS_IMAGES_URL}${encodeURIComponent(file)}`);
  }

  // Property names that tooling probes on objects (await, console.log, JSON.stringify, bundlers...).
  // They must NOT be treated as monster names, or `await MSM` / `return MSM` would resolve to null.
  const RESERVED_KEYS = new Set([
    'then', 'toJSON', 'inspect', 'constructor', 'prototype', '__esModule', 'default',
    '$$typeof', 'nodeType', 'asymmetricMatch', 'toString', 'valueOf'
  ]);

  // One loader per monster name, kept separate from the raw-JSON cache so the two can't collide.
  const monsterLoaders = new Map();
  function loadMonsterOnce(name) {
    const k = name.trim().toLowerCase();
    let p = monsterLoaders.get(k);
    if (!p) {
      p = getMonster(name).then(m => {
        if (!m) monsterLoaders.delete(k); // don't cache failures - allow a retry
        return m;
      });
      monsterLoaders.set(k, p);
    }
    return p;
  }

  const MSM = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop);
      const key = String(prop);
      if (RESERVED_KEYS.has(key)) return Reflect.get(target, prop);

      if (key === "getDofBaseUrl") return () => DOF_MONSTERS_URL;
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (key === "getIslandImg") return getIslandImg;
      if (key === "fetchIsland" || key === "island") return fetchIsland;
      if (key === "fetchIslands" || key === "islands") return fetchIslands;
      if (["get", "monster"].includes(key.toLowerCase())) return getMonster;
      if (["getdofmonster", "dofmonster"].includes(key.toLowerCase())) return getDofMonster;
      if (key === "fetchNewsImages" || key === "newsImages") return fetchNewsImages;
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
    https://github.com/${REPO}
            `);

          return {
            version: COMMIT_HASH,
            mode: LOCAL_MODE ? "Local" : "CDN"
          };
        };
      }

      const loader = loadMonsterOnce(key);

      return new Proxy({ _loader: loader }, {
        get(target, sub) {
          if (typeof sub === 'symbol') return undefined;
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

})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
