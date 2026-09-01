import { readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const assetRoot = path.resolve('public/hikakaku-watch-story/models');
const modelDirectories = await readdir(assetRoot, { withFileTypes: true });

for (const directory of modelDirectories) {
  if (!directory.isDirectory()) continue;
  const directoryPath = path.join(assetRoot, directory.name);
  const files = await readdir(directoryPath);

  for (const file of files) {
    if (!file.endsWith('.png')) continue;
    const inputPath = path.join(directoryPath, file);
    const outputPath = path.join(directoryPath, file.replace(/\.png$/u, '.webp'));
    await sharp(inputPath).webp({ quality: 84, effort: 6 }).toFile(outputPath);
    console.log(path.relative(process.cwd(), outputPath));
  }
}
