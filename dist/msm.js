/**
 * @typedef {Object} Monster
 * @property {string} name
 * @property {string} description
 * @property {string} image
 * @property {string} cost
 * @property {string[]} islands
 * @property {function(): string} like
 * @property {function(): string} info
 * @property {function(): {name:string, islands:number, cost:string, description:string}} statistics
 */

/**
 * @type {{getMonster: function(string): Promise<Monster>, monster: function(string): Promise<Monster>}}
 */
const MSM = { getMonster, monster: getMonster };

(function (global) {
  const BASE_URL = "https://cdn.jsdelivr.net/gh/gaboom63/MSM-API/data/monsters/";

  async function getMonster(name) {
    name = name.toLowerCase();
    const url = `${BASE_URL}${name}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster ${name} not found`);
    const data = await res.json();

    return {
      ...data,
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
          description: data.description || "No description available."
        };
      }
    };
  }

  const MSM = { 
    getMonster,
    monster: getMonster
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
