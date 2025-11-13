/**
 * @typedef {Object} Monster
 * @property {string} name
 * @property {string} description
 * @property {string} image
 * @property {string} cost
 * @property {string[]} islands
 * @property {function(string): string} islands
 * @property {function(): string} like
 * @property {function(): string} info
 * @property {function(): {name:string, islands:number, cost:string, description:string}} statistics
 */

(function (global) {
  const BASE_URL = "https://raw.githubusercontent.com/gaboom63/MSM-API/master/data/monsters/";
  const cache = {};

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

    const fileName = baseName.replace(
      /(^|[\s'-])([a-z])/g,
      (m, before, letter) => before + letter.toUpperCase()
    );

    return { folder, file: fileName };
  }



  async function getMonster(name) {
    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    let res = await fetch(url);

    // If the monster isn't found, try fuzzy matching
    if (!res.ok) {
      console.warn(`Direct fetch failed for ${file}. Trying fuzzy match...`);

      const apiUrl = `https://api.github.com/repos/gaboom63/MSM-API/contents/data/monsters/${folder}`;
      const listRes = await fetch(apiUrl);

      if (!listRes.ok) throw new Error(`Monster ${name} not found at ${url}`);
      const files = await listRes.json();

      // Normalize names for comparison
      const normalize = s => s.toLowerCase().replace(/[^a-z]/g, "");
      const target = normalize(file);

      // Find closest match (exact letters, ignoring punctuation/case)
      let bestMatch = null;
      for (const f of files) {
        if (f.name.endsWith(".json")) {
          const base = f.name.replace(".json", "");
          if (normalize(base) === target) {
            bestMatch = f.name;
            break;
          }
        }
      }

      if (!bestMatch) {
        throw new Error(`Monster ${name} not found (even with fuzzy search) in ${folder}`);
      }

      console.warn(`Resolved fuzzy match: ${file} → ${bestMatch}`);
      res = await fetch(`${BASE_URL}${folder}/${bestMatch}`);
      if (!res.ok) throw new Error(`Failed to load fuzzy match ${bestMatch}`);
    }

    const data = await res.json();

    // (rest of your code remains unchanged)
    const monsterImageCache = {};

    return {
      ...data,

      async loadImage(imgElement) {
        let img = document.getElementById(imgElement);
        if (!img) {
          const elements = document.getElementsByClassName(imgElement);
          if (elements.length > 0) img = elements[0];
        }
        if (!img) {
          console.error(`Image element with ID or class "${imgElement}" not found`);
          return;
        }

        const monsterName = data.name.toLowerCase();
        const monsterImageCache = getMonster.cache || (getMonster.cache = {});

        if (monsterImageCache[monsterName]) {
          img.src = monsterImageCache[monsterName];
          return;
        }

        try {
          let src = data.image;
          if (src && !src.startsWith("http")) {
            src = `https://raw.githubusercontent.com/gaboom63/MSM-API/master/${src}`;
          }

          if (!src) {
            console.warn(`No image specified for ${data.name}`);
            img.src = "";
            return;
          }

          monsterImageCache[monsterName] = src;
          img.src = src;
        } catch (err) {
          console.error(`Error loading ${monsterName}:`, err);
          img.src = "";
        }
      },

      islands(islandName) {
        const firstWord = islandName.split(" ")[0].toLowerCase();
        return data.islands.includes(firstWord)
          ? `${data.name} is on ${islandName}!`
          : `${data.name} is not on ${islandName}.`;
      },
      island() {
        return data.islands;
      },
      description() {
        return `${data.name}'s Description: ${data.description || "No description available."}`;
      },
      like() {
        return `You liked ${data.name}!`;
      },
      info() {
        return `${data.name} costs ${data.cost} and appears on ${data.islands.length} islands.`;
      },
      statistics() {
        return {
          name: data.name,
          islands: data.islands?.length || 0,
          cost: data.cost || "Unknown",
          description: data.description || "No description available.",
        };
      },
    };
  }


  const MSM = new Proxy({}, {
    get(target, prop) {
      // Always normalize the property name
      const normalized = String(prop).toLowerCase();

      if (normalized === "monster" || normalized === "getmonster") return getMonster;
      if (cache[normalized]) return cache[normalized];

      const placeholder = {};
      Object.defineProperty(placeholder, "_loaded", {
        value: (async () => {
          const monster = await getMonster(normalized);
          cache[normalized] = monster;
          return monster;
        })(),
        enumerable: false,
      });

      const proxy = new Proxy(placeholder, {
        get(_, subProp) {
          return async (...args) => {
            const real = await placeholder._loaded;
            const value = real[subProp];
            return typeof value === "function" ? value(...args) : value;
          };
        },
      });

      cache[normalized] = proxy;
      return proxy;
    },
  });


  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
