const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const imagesDir = path.join(__dirname, 'images');
const outputFile = path.join(dataDir, 'master_database.json');

// Initialize the only global databases the API still needs
const masterDb = {
    "Image Manifest": {},
    "Element Image Manifest": {},
    "Island Manifest": {},
    "Costumes": {},
    "Sounds": {},
    "Islands": {}
};

console.log("🔍 Scanning file system to build master database...");

// 1. Build Image Manifest & Roster from /data/Monsters/
const monstersDir = path.join(dataDir, 'Monsters');
if (fs.existsSync(monstersDir)) {
    fs.readdirSync(monstersDir).forEach(folder => {
        const folderPath = path.join(monstersDir, folder);
        if (fs.statSync(folderPath).isDirectory()) {
            // Save the exact casing of the folder for Linux lookups
            masterDb["Image Manifest"][folder] = folder; 

            // Extract the Islands list for the global Island roster feature
            const dataJsonPath = path.join(folderPath, 'data.json');
            if (fs.existsSync(dataJsonPath)) {
                try {
                    const mData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
                    if (mData.Islands && Array.isArray(mData.Islands)) {
                        masterDb["Islands"][mData.Name || folder] = mData.Islands;
                    }
                } catch (e) {
                    console.error(`❌ Error parsing ${dataJsonPath}: ${e.message}`);
                }
            }
        }
    });
}

// 2. Build Element Manifest from /images/elements/
const elementsDir = path.join(imagesDir, 'elements');
if (fs.existsSync(elementsDir)) {
    const stripPrefixes = [
        'Natural',
        'Paironormal',
        'Seasonal (Core)',
        'Seasonal (Aux)',
        'Seasonal (Aux.)',
        'Ethereal',
        'Magical',
        'Supernatural'
    ];

    fs.readdirSync(elementsDir).forEach(file => {
        if (file.endsWith('.png')) {
            const fileName = path.parse(file).name.trim();

            let key = fileName;

            // Split only on the FIRST " - "
            const separatorIndex = fileName.indexOf(' - ');

            if (separatorIndex !== -1) {
                const category = fileName.slice(0, separatorIndex).trim();
                const element = fileName.slice(separatorIndex + 3).trim();

                if (stripPrefixes.includes(category)) {
                    key = element;
                } else {
                    key = `${category} ${element}`;
                }
            }

            // Warn if two files would generate the same key
            if (masterDb["Element Image Manifest"][key]) {
                console.warn(
                    `⚠️ Duplicate element key "${key}" from "${file}" (already mapped to "${masterDb["Element Image Manifest"][key]}")`
                );
            }

            masterDb["Element Image Manifest"][key] = file;
        }
    });
}

// 3. Build Island Skins Manifest from /images/islands/
const islandsDir = path.join(imagesDir, 'islands');
if (fs.existsSync(islandsDir)) {
    fs.readdirSync(islandsDir).forEach(file => {
        if (file.endsWith('.png')) {
            // Groups standard and skins (e.g., "Plant Island (Spooktacle Skin).png" -> "plant_island")
            const baseName = file.split('(')[0].trim().toLowerCase().replace(/\s+/g, '_');
            if (!masterDb["Island Manifest"][baseName]) masterDb["Island Manifest"][baseName] = [];
            masterDb["Island Manifest"][baseName].push(`images/islands/${file}`);
        }
    });
}

// 4. Build Costumes Database from /data/costumes/
const costumesDir = path.join(dataDir, 'costumes');
['Common', 'Rare', 'Epic'].forEach(rarity => {
    const rarityPath = path.join(costumesDir, rarity);
    if (fs.existsSync(rarityPath)) {
        fs.readdirSync(rarityPath).forEach(monster => {
            const monsterPath = path.join(rarityPath, monster);
            if (fs.statSync(monsterPath).isDirectory()) {
                if (!masterDb["Costumes"][monster]) masterDb["Costumes"][monster] = {};
                // Grab all PNG files inside the monster's costume folder
                masterDb["Costumes"][monster][rarity] = fs.readdirSync(monsterPath).filter(f => f.endsWith('.png'));
            }
        });
    }
});

// 5. Build Sounds Database from /data/sounds/
const soundsDir = path.join(dataDir, 'sounds');
['Common', 'Rare', 'Epic'].forEach(rarity => {
    const rarityPath = path.join(soundsDir, rarity);
    if (fs.existsSync(rarityPath)) {
        fs.readdirSync(rarityPath).forEach(monster => {
            const monsterPath = path.join(rarityPath, monster);
            if (fs.statSync(monsterPath).isDirectory()) {
                if (!masterDb["Sounds"][monster]) masterDb["Sounds"][monster] = {};
                // Grab all audio files inside the monster's sound folder
                masterDb["Sounds"][monster][rarity] = fs.readdirSync(monsterPath).filter(f => f.match(/\.(mp3|wav|ogg)$/i));
            }
        });
    }
});

// Write everything to the final JSON file
fs.writeFileSync(outputFile, JSON.stringify(masterDb, null, 2));
console.log(`✅ Success! Generated master_database.json completely dynamically!`);