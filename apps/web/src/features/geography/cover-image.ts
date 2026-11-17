import sharp from 'sharp';

export async function optimizeCover(file: File) {
  const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 36_000_000 });
  const { format, pages } = await source.metadata();
  if (`image/${format}` !== file.type || (pages ?? 1) > 1)
    throw new Error('Image statique invalide.');
  return source
    .autoOrient()
    .resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
