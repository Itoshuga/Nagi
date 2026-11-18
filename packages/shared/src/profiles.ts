import { z } from 'zod';
import { destinationIdSchema } from './geography';

export const profileColors = {
  '#73a6df': 'Bleu Nagi',
  '#4f8bab': 'Bleu océan',
  '#638872': 'Vert forêt',
  '#ce8fa9': 'Rose sakura',
  '#9385ba': 'Violet crépuscule',
  '#c98c64': 'Orange couchant',
  '#b6a385': 'Sable',
  '#7d899a': 'Gris ardoise',
} as const;
export const profileCharacterCount = (value: string) => Array.from(value).length;
export const profileHref = (username: string) => `/app/profile/@${encodeURIComponent(username)}`;
export const profileHandleInput = z
  .string()
  .transform((value) => {
    // Next route params can retain the encoded @ character. Decode once, then validate.
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })
  .pipe(z.string().regex(/^@[a-z0-9_.]{2,32}$/i))
  .transform((value) => value.slice(1).toLowerCase());

function detectionText(value: string) {
  let text = value.normalize('NFKC').toLowerCase();
  for (let i = 0; i < 2; i++) {
    text = text
      .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code: string) => {
        const number = code.startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
      })
      .replace(
        /&(?:colon|sol|period|commat);/g,
        (entity) => ({ '&colon;': ':', '&sol;': '/', '&period;': '.', '&commat;': '@' })[entity]!,
      );
    try {
      text = decodeURIComponent(text);
    } catch {
      /* Ordinary percent signs remain plain text. */
    }
  }
  return text
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[\u3002\uff0e\uff61]/g, '.')
    .replace(/\s*(?:\[\s*(?:\.|dot|point)\s*\]|\(\s*(?:\.|dot|point)\s*\))\s*/g, '.')
    .replace(
      /\s+(?:dot|point)\s+(?=(?:com|org|net|fr|io|gg|dev|app|co|me|be|ch|ca|jp|uk|info|xyz)\b)/g,
      '.',
    )
    .replace(/([\p{L}\p{N}])\s+\.\s*([\p{L}\p{N}])/gu, '$1.$2')
    .replace(/\.\s+(com|org|net|fr|io|gg|dev|app|co|me|be|ch|ca|jp|uk|travel|info|xyz)\b/g, '.$1');
}
export function hasProfileLink(value: string) {
  const text = detectionText(value);
  return (
    /\b[a-z][a-z0-9+.-]{1,30}\s*:\s*\/\s*\//i.test(text) ||
    /\bh\s*t\s*t\s*p\s*s?\s*:\s*\/\s*\//i.test(text) ||
    /\b(?:mailto|tel|sms|discord|javascript|data|file|steam|magnet|tg|whatsapp|intent|spotify)\s*:/i.test(
      text,
    ) ||
    /\b[a-z][a-z0-9+.-]{1,30}:[^\s]/i.test(text) ||
    /\bwww\s*\./i.test(text) ||
    /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62})\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]+)(?=$|[^\p{L}\p{N}-])/iu.test(
      text,
    ) ||
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)
  );
}
function plainProfileText(max: number, bio: boolean) {
  return z
    .string()
    .transform((value) => value.normalize('NFC').replace(/\r\n?/g, '\n').trim())
    .superRefine((value, ctx) => {
      if (profileCharacterCount(value) > max)
        ctx.addIssue({ code: 'custom', message: `${max} caractères maximum.` });
      if (hasProfileLink(value))
        ctx.addIssue({
          code: 'custom',
          message: bio
            ? 'Les liens externes ne sont pas autorisés dans votre biographie.'
            : 'Les liens externes ne sont pas autorisés dans votre titre.',
        });
      if (
        (!bio && /[\r\n]/.test(value)) ||
        Array.from(value).some((char) => {
          const code = char.codePointAt(0)!;
          return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
        }) ||
        /<\/?[a-z][^>]*>|<!--|<!doctype\b|<\?|<[@#][^>]+>|@(?:everyone|here)\b/i.test(
          detectionText(value),
        ) ||
        /\|\||(?:^|\n)\s*(?:-{3,}|={3,})\s*(?:\n|$)/m.test(value) ||
        /\*\*|__|~~|`|!?\[[^\]\n]*\]\s*[([]|(?:^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s)|(?:\*[^*\n]+\*|_[^_\n]+_)/m.test(
          value,
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Utilisez du texte simple, sans HTML, Markdown ni mention Discord interactive.',
        });
    });
}
export const profileTitleInput = plainProfileText(40, false);
export const profileBioInput = plainProfileText(280, true);
const optionalId = z.union([z.literal('').transform(() => null), z.null(), destinationIdSchema]);
export const profileCustomizationInput = z
  .object({
    profile_title: profileTitleInput,
    bio: profileBioInput,
    accent: z.enum(
      Object.keys(profileColors) as [keyof typeof profileColors, ...(keyof typeof profileColors)[]],
    ),
    banner_x: z.coerce.number().int().min(0).max(100),
    banner_y: z.coerce.number().int().min(0).max(100),
    dream_country_id: optionalId,
    dream_city_id: optionalId,
  })
  .refine((value) => !value.dream_city_id || value.dream_country_id, {
    message: 'Choisissez le pays de cette ville.',
    path: ['dream_country_id'],
  });
export const profileRevisionInput = z.coerce.number().int().positive();
export type ProfileCustomizationInput = z.infer<typeof profileCustomizationInput>;
export const profileBannerMaxSize = 5 * 1048576;
