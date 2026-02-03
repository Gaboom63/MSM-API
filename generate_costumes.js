const fs = require('fs');
const path = require('path');

// Paths
const costumesDir = path.join(__dirname, 'data', 'costumes');
const outputFile = path.join(__dirname, 'data', 'costumes.json');

const registry = {};

if (fs.existsSync(costumesDir)) {
    console.log("Scanning costumes directory...");
    const monsters = fs.readdirSync(costumesDir);

    monsters.forEach(monsterName => {
        const monsterPath = path.join(costumesDir, monsterName);
        
        // Skip hidden files or non-directories
        if (!fs.statSync(monsterPath).isDirectory() || monsterName.startsWith('.')) return;

        registry[monsterName] = { Common: [], Rare: [], Epic: [] };
        
        // 1. Scan Common (Root of monster folder)
        const rootFiles = fs.readdirSync(monsterPath);
        rootFiles.forEach(file => {
            const filePath = path.join(monsterPath, file);
            if (fs.statSync(filePath).isFile() && !file.startsWith('.')) {
                registry[monsterName].Common.push(file);
            }
            // 2. Scan Subfolders (Rare/Epic)
            else if (fs.statSync(filePath).isDirectory()) {
                if (file === 'Rare' || file === 'Epic') {
                    const subFiles = fs.readdirSync(filePath);
                    subFiles.forEach(subFile => {
                        if (!subFile.startsWith('.')) {
                            registry[monsterName][file].push(subFile);
                        }
                    });
                }
            }
        });

        // Remove empty categories to keep JSON clean
        if (registry[monsterName].Common.length === 0) delete registry[monsterName].Common;
        if (registry[monsterName].Rare.length === 0) delete registry[monsterName].Rare;
        if (registry[monsterName].Epic.length === 0) delete registry[monsterName].Epic;

        // If monster has no costumes at all, remove it
        if (Object.keys(registry[monsterName]).length === 0) delete registry[monsterName];
    });

    fs.writeFileSync(outputFile, JSON.stringify(registry, null, 2));
    console.log(`Success! Generated data/costumes.json with ${Object.keys(registry).length} monsters.`);
} else {
    console.error("Error: Could not find data/costumes folder.");
}
