import type { ImageLoaderProps } from 'next/image';

export const privateImageWidths = [320, 640, 960, 1280, 1600] as const;

export function isPrivateImage(src: string) {
  return /^\/app\/(?:entry-media|catalog-cover|trip-cover|profile-banner)\//.test(src);
}

export function privateImageLoader({ src, width }: ImageLoaderProps) {
  const size = privateImageWidths.find((size) => size >= width) ?? 1600;
  return `${src}${src.includes('?') ? '&' : '?'}w=${size}`;
}
