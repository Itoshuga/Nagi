import 'server-only';

// Node and browsers can expose different IANA lists. Serialize the same options for hydration.
export const tripTimezones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])];
