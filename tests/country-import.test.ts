import { describe, expect, it } from 'vitest';
import {
  countryImportMaxBytes,
  countryImportMaxRows,
  parseCountryImport,
} from '../packages/shared/src/country-import';
const row = { displayOrder: 3, name: ' Côte d’Ivoire ', iso: ' ci ' };
describe('Country JSON import', () => {
  it('normalizes a single country into a draft with an automatic address and optional media/description', () => {
    expect(parseCountryImport(JSON.stringify(row))).toEqual({
      ok: true,
      countries: [
        {
          name: 'Côte d’Ivoire',
          slug: 'cote-d-ivoire',
          iso_code: 'CI',
          sort_order: 3,
          is_published: false,
          description: null,
          cover_image_url: null,
        },
      ],
    });
  });
  it('accepts an array and a UTF-8 BOM, preserving each display order', () => {
    const result = parseCountryImport(
      '\uFEFF' +
        JSON.stringify([
          { ...row, displayOrder: 0 },
          { displayOrder: 9, name: 'Japon', iso: 'jp' },
        ]),
    );
    expect(
      result.ok && result.countries.map((country) => [country.iso_code, country.sort_order]),
    ).toEqual([
      ['CI', 0],
      ['JP', 9],
    ]);
  });
  it.each(['{name:"Japan"}', '', 'null', '42', '[]', '{}'])(
    'rejects malformed/empty input %s',
    (text) => expect(parseCountryImport(text).ok).toBe(false),
  );
  it.each([-1, 1.5, 2147483648, '2', null])('rejects invalid display orders %s', (displayOrder) =>
    expect(parseCountryImport(JSON.stringify({ ...row, displayOrder })).ok).toBe(false),
  );
  it.each([
    { name: '' },
    { name: 'a'.repeat(101) },
    { name: '東京' },
    { iso: 'JPN' },
    { iso: 'J1' },
    { is_published: true },
    { slug: 'injected' },
    { description: 'unexpected' },
    { cover_image_url: 'https://example.org/a.png' },
  ])('rejects invalid or unexpected fields %o', (change) =>
    expect(parseCountryImport(JSON.stringify({ ...row, ...change })).ok).toBe(false),
  );
  it('rejects the entire file when a later row is invalid, with a row number', () => {
    const result = parseCountryImport(
      JSON.stringify([row, { displayOrder: 1, name: 'France', iso: 'FRA' }]),
    );
    expect(result).toMatchObject({ ok: false, issues: [expect.stringContaining('Pays 2')] });
    expect(result).not.toHaveProperty('countries');
  });
  it('detects normalized ISO and generated-address duplicates inside the file', () => {
    expect(parseCountryImport(JSON.stringify([row, { ...row, iso: 'CI' }]))).toMatchObject({
      ok: false,
      error: expect.stringContaining('doublons'),
    });
    expect(
      parseCountryImport(JSON.stringify([row, { ...row, name: 'Cote d Ivoire', iso: 'FR' }])),
    ).toMatchObject({ ok: false, issues: [expect.stringContaining('adresse')] });
  });
  it('bounds bytes and row counts before processing every row', () => {
    expect(parseCountryImport('é'.repeat(countryImportMaxBytes / 2 + 1))).toMatchObject({
      ok: false,
      error: expect.stringContaining('1 Mo'),
    });
    expect(
      parseCountryImport(JSON.stringify(Array(countryImportMaxRows + 1).fill(row))),
    ).toMatchObject({ ok: false, error: expect.stringContaining('500') });
  });
});
