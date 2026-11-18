import { describe, expect, it } from 'vitest';
import {
  catalogEntrySlug,
  catalogFieldInput,
  readCatalogValue,
  safeCatalogUrl,
} from '../packages/shared/src/catalog';

describe('Catalog input', () => {
  it('keeps a readable unique address even when entries share a title', () => {
    const first = catalogEntrySlug('Café d’Asakusa', '723f2e8a-b402-4ff1-82b7-7b62a5f9ccbc');
    const second = catalogEntrySlug('Café d’Asakusa', '4e6f9147-39fb-48a1-896c-1a9f9508c441');
    expect(first).toMatch(/^cafe-d-asakusa-[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
    expect(catalogEntrySlug('東京', '723f2e8a-b402-4ff1-82b7-7b62a5f9ccbc')).toMatch(/^fiche-/);
  });

  it('supports incomplete drafts and validates false, zero, dates and selected values', () => {
    const field = { label: 'Information', options: [], is_required: true };
    expect(readCatalogValue({ ...field, type: 'boolean' }, ['false'], true)).toBe(false);
    expect(readCatalogValue({ ...field, type: 'number' }, ['0'], true)).toBe(0);
    expect(readCatalogValue({ ...field, type: 'number' }, ['10,5'], true)).toBe(10.5);
    expect(readCatalogValue({ ...field, type: 'date' }, ['2028-02-29'], true)).toBe('2028-02-29');
    expect(() => readCatalogValue({ ...field, type: 'date' }, ['2026-02-29'], true)).toThrow();
    expect(readCatalogValue({ ...field, type: 'short_text' }, [], false)).toBeUndefined();
    expect(() => readCatalogValue({ ...field, type: 'short_text' }, [], true)).toThrow(
      /avant de publier/,
    );
    const multiple = { ...field, type: 'multi_select' as const, options: ['A', 'B'] };
    expect(readCatalogValue(multiple, ['B', 'A'], true)).toEqual(['B', 'A']);
    expect(() => readCatalogValue(multiple, ['A', 'A'], true)).toThrow();
  });

  it('restricts links to ordinary web URLs and rejects duplicate options', () => {
    expect(safeCatalogUrl('https://example.org/lieu')).toBe('https://example.org/lieu');
    for (const href of [
      'javascript:alert(1)',
      '//example.org',
      'data:text/html,hi',
      'https://user@example.org',
    ]) {
      expect(safeCatalogUrl(href)).toBeNull();
    }
    expect(
      catalogFieldInput.safeParse({
        key: 'styles',
        label: 'Styles',
        type: 'select',
        options: 'A\nA',
        sort_order: '0',
        is_required: 'false',
      }).success,
    ).toBe(false);
  });

  it('reads ordered button groups, trims labels and allows empty optional drafts', () => {
    const field = { type: 'buttons' as const, label: 'Sources', options: [], is_required: true };
    const buttons = [
      { label: ' Site officiel ', url: ' https://example.org/lieu ' },
      { label: 'Article', url: 'https://example.org/source?q=tokyo#histoire' },
    ];
    expect(readCatalogValue(field, [JSON.stringify(buttons)], true)).toEqual([
      { label: 'Site officiel', url: 'https://example.org/lieu' },
      buttons[1],
    ]);
    expect(readCatalogValue(field, ['[]'], false)).toBeUndefined();
    expect(readCatalogValue({ ...field, is_required: false }, ['[]'], true)).toBeUndefined();
    expect(() => readCatalogValue(field, ['[]'], true)).toThrow(/au moins un bouton/);
    expect(() => readCatalogValue(field, [], true)).toThrow(/avant de publier/);
    expect(
      catalogFieldInput.parse({
        key: 'sources',
        label: 'Sources',
        type: 'buttons',
        options: '',
        sort_order: '0',
        is_required: 'false',
      }).type,
    ).toBe('buttons');
  });

  it('rejects malformed, oversized or unsafe button groups before saving', () => {
    const field = { type: 'buttons' as const, label: 'Sources', options: [], is_required: false };
    const button = { label: 'Source', url: 'https://example.org' };
    for (const value of [
      null,
      {},
      [null],
      [{ ...button, label: '' }],
      [{ ...button, label: 'a'.repeat(81) }],
      [{ label: 'Source' }],
      [{ ...button, tracking: true }],
      Array(13).fill(button),
      ...[
        'javascript:alert(1)',
        'data:text/html,hi',
        '//example.org',
        'https://user:pass@example.org',
        'https://',
      ].map((url) => [{ ...button, url }]),
    ]) {
      expect(() => readCatalogValue(field, [JSON.stringify(value)], false)).toThrow(
        /libellés et les liens/,
      );
    }
    expect(() => readCatalogValue(field, ['not-json'], false)).toThrow(/libellés et les liens/);
  });
});
