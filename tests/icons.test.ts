import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalogFieldInput } from '../packages/shared/src/catalog';
import { iconAssetPath } from '../apps/web/src/features/icons/asset-path';
import { lucideAssetVersion } from '../apps/web/src/features/icons/version.generated';
import {
  isLibraryIcon,
  libraryIconNames,
  searchLibraryIcons,
} from '../apps/web/src/features/icons/library';

describe('Custom field icon library', () => {
  const field = {
    key: 'sources',
    label: 'Sources',
    type: 'buttons',
    options: '',
    sort_order: '0',
    is_required: 'false',
  };

  it('makes the whole installed library available, including icons outside the category presets', () => {
    expect(libraryIconNames.length).toBeGreaterThan(1800);
    expect(new Set(libraryIconNames).size).toBe(libraryIconNames.length);
    for (const icon of ['a-arrow-down', 'notebook-pen', 'zodiac-virgo', 'zoom-out']) {
      expect(isLibraryIcon(icon)).toBe(true);
      expect(searchLibraryIcons(icon)).toContain(icon);
      expect(catalogFieldInput.parse({ ...field, icon }).icon).toBe(icon);
    }
    expect(
      libraryIconNames.every((icon) => catalogFieldInput.safeParse({ ...field, icon }).success),
    ).toBe(true);
  });

  it('supports French search and rejects names outside the registry', () => {
    expect(searchLibraryIcons('ÉTOILE')).toContain('star');
    expect(searchLibraryIcons('livre')).toContain('book-open');
    expect(searchLibraryIcons('source')).toContain('link');
    expect(searchLibraryIcons('not-a-real-icon')).toEqual([]);
    for (const icon of ['constructor', '__proto__', 'not-a-real-icon', '../book', '<script>'])
      expect(isLibraryIcon(icon)).toBe(false);
    expect(catalogFieldInput.safeParse({ ...field, icon: '../book' }).success).toBe(false);
    expect(catalogFieldInput.parse({ ...field, icon: '' }).icon).toBeNull();
    expect(catalogFieldInput.parse(field).icon).toBeNull();
  });

  it('addresses each SVG independently and rejects paths outside the generated icon folder', () => {
    expect(iconAssetPath('book-open')).toBe(`/icons/lucide/${lucideAssetVersion}/book-open.svg`);
    for (const name of [
      null,
      undefined,
      '',
      '../book',
      'a/b',
      'book.svg',
      'book?x=1',
      'book#x',
      '" onload="alert(1)',
      'a'.repeat(81),
    ])
      expect(iconAssetPath(name)).toBeNull();
    expect(libraryIconNames.every((name) => Boolean(iconAssetPath(name)))).toBe(true);
  });

  it('exports SVGs that decode and contain visible pixels, including the upstream license', async () => {
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../scripts/generate-lucide-icons.mjs', import.meta.url)),
    ]);
    const sharp = createRequire(new URL('../apps/web/package.json', import.meta.url))(
      'sharp',
    ) as typeof import('../apps/web/node_modules/sharp').default;
    for (const name of ['book-open', 'sparkles', 'zodiac-virgo', 'alarm-check']) {
      const data = await readFile(
        new URL(`../apps/web/public${iconAssetPath(name)}`, import.meta.url),
      );
      expect(data.toString()).toContain('ISC License');
      const { data: pixels } = await sharp(data)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    }
  });
});
