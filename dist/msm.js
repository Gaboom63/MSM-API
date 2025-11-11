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
  const BASE_URL = "https://cdn.jsdelivr.net/gh/gaboom63/MSM-API@latest/data/monsters/";
  const cache = {};

  /**
   * Normalize the monster name and determine the correct folder.
   * @param {string} rawName
   * @returns {{folder: string, file: string, fullName: string}}
   */
  function resolveMonsterPath(rawName) {
    const words = rawName.trim().split(/\s+/);
    let folder = "Common";
    let baseName = rawName;

    // Check for "Rare" or "Epic" prefixes
    if (words[0].toLowerCase() === "rare") {
      folder = "Rare";
      baseName = words.slice(1).join(" ");
    } else if (words[0].toLowerCase() === "epic") {
      folder = "Epic";
      baseName = words.slice(1).join(" ");
    }

    // Capitalize file name for proper casing (optional)
    const fileName = baseName.replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      folder,
      file: fileName,
      fullName: rawName,
    };
  }

  /**
   * Fetch and build a monster object.
   * @param {string} name
   * @returns {Promise<Monster>}
   */
  async function getMonster(name) {
    const { folder, file } = resolveMonsterPath(name);
    const url = `${BASE_URL}${folder}/${file}.json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster ${name} not found at ${url}`);
    const data = await res.json();

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

  // Main MSM object — with async lazy loading
  const MSM = new Proxy({}, {
    get(target, prop) {
      if (prop === "monster" || prop === "getMonster") return getMonster;

      // Return from cache if already loaded
      if (cache[prop]) return cache[prop];

      // Placeholder for deferred fetch
      const placeholder = {};
      Object.defineProperty(placeholder, "_loaded", {
        value: (async () => {
          const monster = await getMonster(prop);
          cache[prop] = monster; // replace cache with final object
          return monster;
        })(),
        enumerable: false,
      });

      // Proxy defers property access until loaded
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

  // Export for Node or browser
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
