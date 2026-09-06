const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const photosDir = path.join(__dirname, '..', 'public', 'uploads', 'photos');
const files = fs.readdirSync(photosDir).filter(f => f.endsWith('.png'));

async function optimize() {
  for (const file of files) {
    const inputPath = path.join(photosDir, file);
    const outputPath = path.join(photosDir, file.replace('.png', '.webp'));
    const inputSize = fs.statSync(inputPath).size;
    
    await sharp(inputPath)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);
    
    const outputSize = fs.statSync(outputPath).size;
    console.log(`${file}: ${inputSize} → ${outputSize} (${Math.round((1 - outputSize/inputSize) * 100)}% smaller)`);
  }
}

optimize().catch(console.error);
