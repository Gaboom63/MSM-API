(function (global) {
  const BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/monsters/";
  const IMAGE_BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/images/bm/";
  const BREEDING_FILE_PATH = "https://raw.githubusercontent.com/Gaboom63/MSM-API/refs/heads/main/data/monsters/Extras/breedingCombos.json";
  const SOUND_BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/sounds/";
  
  const cache = {};
  let breedingCache = null;

  // --- HELPER: Fetch and Normalize Breeding Data ---
  async function getBreedingDatabase() {
    if (breedingCache) return breedingCache;

    try {
      const res = await fetch(BREEDING_FILE_PATH);
      if (!res.ok) throw new Error(`Could not load breeding file from ${BREEDING_FILE_PATH}`);
      const rawData = await res.json();

      const processed = {};
      
      Object.keys(rawData).forEach(key => {
        if (key.includes("+")) {
          const parts = key.split("+").map(s => s.trim().toLowerCase());
          const sortedKey = parts.sort().join(" + ");
          
          if (processed[sortedKey]) {
             processed[sortedKey] = [...new Set([...processed[sortedKey], ...rawData[key]])];
          } else {
             processed[sortedKey] = rawData[key];
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

  // --- THE FUNCTION YOU WANT ---
  async function calculateBreeding(comboString) {
    const db = await getBreedingDatabase();
    
    if (!comboString || !comboString.includes("+")) {
      return ["Invalid format. Please use 'Monster A + Monster B'"];
    }

    const searchKey = comboString
      .split("+")
      .map(s => s.trim().toLowerCase())
      .sort()
      .join(" + ");

    return db[searchKey] || ["No combination found."];
  }

  // --- Monster Logic ---
  function resolveMonsterPath(rawName) {
    const words = rawName.trim().split(/\s+/);
    let folder = "Common";
    let baseName = rawName;

    if (words[0].toLowerCase() === "rare") {
      folder = "Rare";
      baseName = words.slice(1).join(" ");
    } else if (words[0].toLowerCase() === "epic") {
      folder = "Epic";
      baseName = words.slice(1).join(" ");
    }

    const hasCaps = /[A-Z]/.test(baseName);
    const fileName = hasCaps 
      ? baseName 
      : baseName.replace(/\b\w/g, (c) => c.toUpperCase());

    return { folder, file: fileName };
  }
  
  function resolveMonsterSoundName(rawName) {
    // Remove rarity
    let name = rawName.replace(/^(rare|epic)\s+/i, "").trim();
  
    // Normalize casing: Title Case per word, keep symbols
    name = name.replace(/\b\w/g, c => c.toUpperCase());
  
    // Replace spaces with underscores
    name = name.replace(/\s+/g, "_");
  
    return `${name}_Memory_Sample.mp3.mpeg`;
  }
  
  async function getMonster(name) {
    if (cache[name] && !cache[name]._loaded) return cache[name];

    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Monster "${name}" not found at ${url}`);
      
      const data = await res.json();
      
      let rawImage = data.image || file;
      let finalImageUrl;

      if (rawImage.startsWith("http")) {
          finalImageUrl = rawImage;
      } else {
          if (!rawImage.toLowerCase().endsWith('.png')) {
             rawImage += '.png';
          }
          finalImageUrl = `${IMAGE_BASE_URL}${encodeURIComponent(rawImage)}`;
      }

      return {
        ...data,
        rarity: folder,
        imageUrl: finalImageUrl,
        
        getImageURL() {
          return this.imageUrl;
        },

        async loadImage(selector) {
          let img = document.getElementById(selector) || document.querySelector(`.${selector}`);
          if (!img) {
            console.warn(`Element "${selector}" not found.`);
            return;
          }
          img.src = this.imageUrl;
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
          if (!data.breedingTime || data.breedingTime.length === 0) {
             return { breedingTime: "Unknown", enhancedTime: "Unknown" };
          }
          const time = data.breedingTime[0];
          const [breeding, enhanced] = time.includes(", ") ? time.split(", ") : [time, "Unknown"];

          return {
              breedingTime: breeding.replace("Breeding Time: ", ""),
              enhancedTime: enhanced.replace("Enhanced Time: ", "")
          }
        },
        async getBreedingCombos() {
          return data.breedingCombo;
        },
        
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
        soundUrl: `${SOUND_BASE_URL}${encodeURIComponent(
          resolveMonsterSoundName(data.name)
        )}`,

        getSoundURL() {
          return this.soundUrl;
        },

        async playSound() {
          try {
            const audio = new Audio(this.soundUrl);
            await audio.play();
          } catch (err) {
            console.warn(`Sound not available for ${data.name}`);
          }
      };
    } catch (err) {
      console.error(`MSM-API Error:`, err);
      return null;
    }
  }

  // --- PROXY HANDLER (The Fix) ---
  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop); 

      // 1. Check if the user is asking for the breeding function directly
      if (key === "twoMonsterCombo") return calculateBreeding;

      // 2. Otherwise, treat it as a request for a Monster object
      if (key.toLowerCase() === "get" || key.toLowerCase() === "monster") return getMonster;
      if (cache[key]) return cache[key];

      const placeholder = {
        _loaded: getMonster(key).then(monster => {
          cache[key] = monster;
          return monster;
        })
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
    },
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
