const fs = require('fs');
const path = require('path');

// Point these to your specific folder structures
const inputDir = path.join(__dirname, 'data', 'JSONS');
const outputFile = path.join(__dirname, 'data', 'master_database.json');

const filesToMerge = [
  'Breeding Times.json', 'Celestials.json', 'Costumes.json', 'Islands.json',
  'Likes.json', 'Costs.json', 'Descriptions.json', 'Elements.json',
  'Image Manifest.json', 'Sounds.json', 'Wublins.json', 'Element Image Manifest.json',
  'breedingCombos.json' // We can include this one too!
];

let masterDb = {};

filesToMerge.forEach(fileName => {
    const filePath = path.join(inputDir, fileName);
    
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const parsedData = JSON.parse(rawData);
        const keyName = fileName.replace('.json', ''); // e.g., 'Descriptions'
        
        // OPTIMIZATION: Convert Arrays into O(1) Object Maps for faster API lookups
        if (['Descriptions', 'Costs', 'Elements'].includes(keyName) && Array.isArray(parsedData)) {
            let optimizedObj = {};
            parsedData.forEach(item => {
                const nameKey = item.name || item.Name;
                if (nameKey) optimizedObj[nameKey] = item;
            });
            masterDb[keyName] = optimizedObj;
        } else {
            // Keep objects (like Wublins, Image Manifest, etc.) exactly as they are
            masterDb[keyName] = parsedData;
        }
    } else {
        console.warn(`⚠️ Skipping: ${fileName} not found in ${inputDir}`);
    }
});

// Write the final compressed master file
fs.writeFileSync(outputFile, JSON.stringify(masterDb));
console.log(`✅ Successfully merged ${Object.keys(masterDb).length} databases into master_database.json!`);
