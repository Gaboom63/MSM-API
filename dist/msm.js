(function (global) {
  /* ---------------- CONFIG & VERSIONED CACHE ---------------- */
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

  // --- VERSIONED CACHE HELPER ---
  async function fetchWithCache(storageKey, url) {
    if (cache[storageKey]) return cache[storageKey];
    const versionedKey = `msm_${COMMIT_HASH}_${storageKey}`;
    const saved = localStorage.getItem(versionedKey);
    if (saved) {
        const parsed = JSON.parse(saved);
        cache[storageKey] = parsed;
        return parsed;
    }
    try {
        const res = await fetch(url, { credentials: 'omit' });
        const data = await res.json();
        localStorage.setItem(versionedKey, JSON.stringify(data));
        cache[storageKey] = data;
        return data;
    } catch (e) { return null; }
  }
  
  // Background Sync: Fire-and-forget so it doesn't block the UI
  async function syncToLatestCommit() {
    const lastCheck = localStorage.getItem('msm_hash_last_check') || 0;
    const now = Date.now();
    if (now - lastCheck < 600000 && COMMIT_HASH !== 'main') { updateUrls(); return; }

    try {
      const res = await fetch('https://api.github.com/repos/Gaboom63/MSM-API/commits/main', { credentials: 'omit' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (COMMIT_HASH !== data.sha) {
          const oldHash = COMMIT_HASH;
          COMMIT_HASH = data.sha;
          localStorage.setItem('msm_api_hash', COMMIT_HASH);
          
          // Cleanup routine to delete old versioned data
          Object.keys(localStorage).forEach(key => {
              if (key.startsWith('msm_') && key.includes(oldHash)) {
                  localStorage.removeItem(key);
              }
          });
          console.log(`Update detected! Switched from ${oldHash} to ${COMMIT_HASH}`);
          updateUrls(); // Refresh URLs with the new hash
      }
      localStorage.setItem('msm_hash_last_check', now);
    } catch (err) { console.warn("Background sync failed."); }
  }

  updateUrls();
  syncToLatestCommit(); // Triggered in background (no 'await' here)

  const cache = {}; 
  let breedingCache = null, elementCache = null, elementDbPromise = null, nameRegistry = {};

  function getStringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase(), s2 = str2.toLowerCase();
    if (s1 === s2) return 1.0;
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i++) track[0][i] = i;
    for (let j = 0; j <= s2.length; j++) track[j][0] = j;
    for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
            const ind = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + ind);
        }
    }
    return 1.0 - (track[s2.length][s1.length] / Math.max(s1.length, s2.length));
  }

  /* ---------------- ELEMENTS (UNBLOCKED) ---------------- */
  async function getElementDatabase() {
    if (elementCache) return elementCache;
    if (!elementDbPromise) {
        elementDbPromise = fetchWithCache('elements_db', ELEMENT_INDEX_URL).then(data => {
            elementCache = data || {};
            return elementCache;
        });
    }
    return elementDbPromise;
  }

  async function resolveElementImage(elementName) {
    if (!elementName) return null;
    const name = typeof elementName === 'object' ? (elementName.name || elementName.id) : elementName;
    const db = await getElementDatabase(); 
    const normalized = name.toLowerCase().replace(/\s+/g, "-");
    let file = db[name] || db[name.toLowerCase()] || db[normalized] || db[`${normalized}-element`];
    return file ? `${ELEMENTS_URL}${encodeURIComponent(file)}` : null;
  }

  /* ---------------- BREEDING & PATHS (UNBLOCKED) ---------------- */
  async function getBreedingDatabase() {
    if (breedingCache) return breedingCache;
    const rawData = await fetchWithCache('breeding_db', BREEDING_FILE_PATH);
    if (!rawData) return {};
    const processed = {};
    Object.keys(rawData).forEach(key => {
        if (!key.includes("+")) nameRegistry[key.toLowerCase()] = key;
        if (key.includes("+")) {
            const pts = key.split("+").map(s => s.trim().toLowerCase());
            const sortedKey = pts.sort().join(" + ");
            processed[sortedKey] = processed[sortedKey] ? [...new Set([...processed[sortedKey], ...rawData[key]])] : rawData[key];
            if (Array.isArray(rawData[key])) rawData[key].forEach(child => nameRegistry[child.toLowerCase()] = child);
        } else { processed[key.toLowerCase()] = rawData[key]; }
    });
    breedingCache = processed;
    return processed;
  }

  function resolveMonsterPath(rawName) {
      const lowerName = rawName.trim().toLowerCase();
      let folder = "Common", baseNameClean = rawName.trim();
      if (lowerName.startsWith("rare ")) { folder = "Rare"; baseNameClean = rawName.substring(5).trim(); }
      else if (lowerName.startsWith("epic ")) { folder = "Epic"; baseNameClean = rawName.substring(5).trim(); }
      const registryKey = baseNameClean.toLowerCase();
      if (nameRegistry[registryKey]) return { folder, file: nameRegistry[registryKey], baseNameClean };
      let fn = null, bs = 0;
      Object.values(nameRegistry).forEach(regName => {
          const s = getStringSimilarity(baseNameClean, regName);
          if (s > bs) { bs = s; fn = regName; }
      });
      return { folder, file: fn || (baseNameClean.charAt(0).toUpperCase() + baseNameClean.slice(1)), baseNameClean };
  }

  async function calculateBreeding(comboString) {
    const db = await getBreedingDatabase();
    if (!comboString || !comboString.includes("+")) return ["Invalid format"];
    const searchKey = comboString.split("+").map(s => s.trim().toLowerCase()).sort().join(" + ");
    return db[searchKey] || ["No combination found."];
  }

  async function getMonster(name) {
    const { folder, file, baseNameClean } = resolveMonsterPath(name);
    const data = await fetchWithCache(`monster_${folder}_${file}`, `${BASE_URL}${folder}/${encodeURIComponent(file)}.json`);
    if (!data) return null;
    try {
      let rawImage = data.image || data.name;
      if (!rawImage.toLowerCase().endsWith(".png")) rawImage += ".png";
      const finalImageUrl = rawImage.startsWith("http") ? rawImage : `${IMAGE_BASE_URL}${encodeURIComponent(rawImage.trim())}`;
      const costumeDb = await fetchWithCache('costumes_db', COSTUME_INDEX_URL);
      const cleanName = data.name.replace(/^(rare|epic)\s+/i, "").trim();
      const costumeFiles = costumeDb?.[cleanName]?.[folder] || [];
      const costumePath = folder === "Common" ? cleanName : `${cleanName}/${folder}`;
      const costumes = costumeFiles.map(f => `https://cdn.jsdelivr.net/gh/Gaboom63/MSM-API@${COMMIT_HASH}/data/costumes/${encodeURIComponent(costumePath)}/${encodeURIComponent(f)}`);
      return {
        ...data, rarity: folder, imageUrl: finalImageUrl, costumes, _costumeIndex: costumes.length,
        async getElementImages() {
          let rawEls = data.element || data.elements || [];
          let elements = Array.isArray(rawEls) ? rawEls.flat() : [];
          if (elements.length === 0 && folder !== "Common") {
              const common = await getMonster(baseNameClean);
              elements = (common?.element || common?.elements || []).flat();
          }
          return Promise.all(elements.map(async el => ({ name: el, image: await resolveElementImage(el) })));
        },
        async loadImage(selector) { const el = document.getElementById(selector) || document.querySelector(`.${selector}`); if (el) el.src = this.imageUrl; },
        async getBreedingTime() {
          if (!data.breedingTime?.[0]) return { breedingTime: "Unknown", enhancedTime: "Unknown" };
          const parts = data.breedingTime[0].split(", ");
          return { breedingTime: parts[0].replace("Breeding Time: ", ""), enhancedTime: (parts[1] || "").replace("Enhanced Time: ", "") };
        },
        async getBreedingCombos() { return data.breedingCombo; },
        async playSound() { try { const a = new Audio(`${SOUND_BASE_URL}${encodeURIComponent(data.name.replace(/\s+/g, "_"))}_Memory_Sample.mp3.mpeg`); a.crossOrigin="anonymous"; await a.play(); } catch(e){} },
        nextCostume() { this._costumeIndex = (this._costumeIndex + 1) % (this.costumes.length + 1); return this._costumeIndex === this.costumes.length ? this.imageUrl : this.costumes[this._costumeIndex]; }
      };
    } catch (err) { return null; }
  }

  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop);
      if (key === "twoMonsterCombo") return calculateBreeding;
      if (["get", "monster"].includes(key.toLowerCase())) return getMonster;
      if (cache[key]) return cache[key];
      const loader = getMonster(key).then(m => (cache[key] = m));
      return new Proxy({ _loader: loader }, {
          get(target, sub) { return async (...args) => { const real = await target._loader; if (!real) return null; const val = real[sub]; return typeof val === "function" ? val.apply(real, args) : val; }; }
      });
    }
  });

  global.MSM = MSM;
})(this);
