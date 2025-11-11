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

    const fileName = baseName.replace(/\b\w/g, (c) => c.toUpperCase());
    return { folder, file: fileName };
  }

  async function getMonster(name) {
    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster ${name} not found at ${url}`);
    const data = await res.json();

    // Automatically set image path based on folder
    data.image = `${BASE_URL}${folder}/${file}.png`;

    return {
      ...data,
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
