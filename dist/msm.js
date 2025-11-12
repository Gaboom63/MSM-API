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
  // Use GitHub raw files instead of jsDelivr
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

    const fileName = baseName.replace(/\b\w/g, (c) => c.toLowerCase());
    return { folder, file: fileName };
  }

  async function getMonster(name) {
    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster ${name} not found at ${url}`);
    const data = await res.json();

    let dataImgSrc = name.slice(0, 1).toUpperCase();
    let newName = dataImgSrc + name.slice(1, name.length);
    data.image = `https://raw.githubusercontent.com/gaboom63/MSM-API/master/images/bm/${newName}.png`;
    const monsterImageCache = {};

    return {
      ...data,
      async loadImage(imgElement, monsterName) {
        const img = document.getElementById(imgElement);
        if (!img) {
          console.error(`Image element #${imgElement} not found`);
          return;
        }

        // If cached, use it immediately
        if (monsterImageCache[monsterName]) {
          img.src = monsterImageCache[monsterName];
          return;
        }

        const monster = MSM[monsterName];
        if (!monster || typeof monster.image !== 'function') {
          console.error(`Monster "${monsterName}" not found or invalid`);
          img.src = "";
          return;
        }

        try {
          const src = await monster.image();
          monsterImageCache[monsterName] = src; // cache the result
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
      if (prop === "monster" || prop === "getMonster") return getMonster;
      if (cache[prop]) return cache[prop];

      const placeholder = {};
      Object.defineProperty(placeholder, "_loaded", {
        value: (async () => {
          const monster = await getMonster(prop);
          cache[prop] = monster;
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

      cache[prop] = proxy;
      return proxy;
    },
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
