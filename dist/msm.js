// dist/msm.js
(function (global) {
  const BASE_URL = "https://cdn.jsdelivr.net/gh/gaboom63/MSM-API/data/monsters/";

  async function getMonster(name) {
    name = name.toLowerCase();
    const url = `${BASE_URL}${name}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Monster ${name} not found`);
    const data = await res.json();

    // Wrap it with helper methods
    return {
      ...data,
      like() {
        return `You liked ${data.name}!`;
      },
      info() {
        return `${data.name} costs ${data.cost} and appears on ${data.islands.length} islands.`;
      }
    };
  }

  const MSM = { getMonster };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MSM;
  } else {
    global.MSM = MSM;
  }
})(this);
