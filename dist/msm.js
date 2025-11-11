// dist/msm.js
(function (global) {
  const BASE_URL = "https://cdn.jsdelivr.net/gh/gaboom63/MSM-API/data/monsters/";

  async function monster(name) {
    if (!name) throw new Error("Monster name is required.");
    const safeName = name.trim().toLowerCase().replace(/\s+/g, "");
    const url = `${BASE_URL}${safeName}.json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster "${name}" not found.`);

    const data = await res.json();

    // Add methods to the monster object
    return {
      ...data,

      like() {
        return `You liked ${data.name}!`;
      },

      statistics() {
        return {
          name: data.name,
          islands: data.islands?.length || 0,
          cost: data.cost || "Unknown",
          description: data.description || "No description available."
        };
      },

      info() {
        const islandList = (data.islands || []).join(", ");
        return `${data.name} costs ${data.cost} and appears on: ${islandList}`;
      }
    };
  }

  const MSM = { monster };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
