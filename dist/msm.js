(function (global) {
  const BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/monsters/";
  const IMAGE_BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/images/bm/";
  
  const cache = {};

  function resolveMonsterPath(rawName) {
    const words = rawName.trim().split(/\s+/);
    let folder = "Common";
    let baseName = rawName;

    // Detect Rarity and strip it from the base name for the JSON path
    if (words[0].toLowerCase() === "rare") {
      folder = "Rare";
      baseName = words.slice(1).join(" ");
    } else if (words[0].toLowerCase() === "epic") {
      folder = "Epic";
      baseName = words.slice(1).join(" ");
    }

    // Preserve exact casing if the user types uppercase letters
    const hasCaps = /[A-Z]/.test(baseName);
    const fileName = hasCaps 
      ? baseName 
      : baseName.replace(/\b\w/g, (c) => c.toUpperCase());

    return { folder, file: fileName };
  }

  async function getMonster(name) {
    if (cache[name] && !cache[name]._loaded) {
        return cache[name];
    }

    const { folder, file } = resolveMonsterPath(name);
    
    // JSON is inside the rarity folder: e.g., "Rare/Mammott.json"
    const url = `${BASE_URL}${folder}/${file}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Monster "${name}" not found at ${url}`);
      
      const data = await res.json();
      
      // --- THE FIX ---
      // 1. Start with the file name (e.g., "Mammott" or "eRmA gUrDy (Major)")
      let imageFile = file;

      // 2. If it is Rare or Epic, we MUST add that prefix back for the image
      //    (Because images are in a flat folder: "Rare Mammott.png")
      if (folder !== "Common") {
        imageFile = `${folder} ${file}`;
      }

      return {
        ...data,
        rarity: folder,
        // encodeURIComponent ensures spaces become %20
        imageUrl: `${IMAGE_BASE_URL}${encodeURIComponent(imageFile)}.png`,
        
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

        getStatistics() {
          return {
            name: data.name,
            rarity: folder,
            elements: data.elements || [],
            islands: data.islands || [],
            cost: data.cost || "Unknown",
            description: data.description || "No description available.",
          };
        }
      };
    } catch (err) {
      console.error(`MSM-API Error:`, err);
      return null;
    }
  }

  const MSM = new Proxy({}, {
    get(target, prop) {
      const key = String(prop); 

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