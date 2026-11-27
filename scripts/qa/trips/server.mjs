import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
const root =
  process.env.NAGI_QA_SOURCE_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
const port = process.env.NAGI_QA_PORT ?? '3106';
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-fixture-key-no-real-secret',
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-fixture-key-no-real-secret',
  DISCORD_APPLICATION_ID: '111111111111111111',
  DISCORD_COMMAND_SCOPE: 'global',
  DISCORD_BOT_TOKEN: 'test-bot-fixture-token-no-real-secret',
  DISCORD_CLIENT_SECRET: 'test-oauth-fixture-secret',
  NAGI_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  NAGI_OWNER_DISCORD_IDS: '',
  NAGI_COVER_MAX_MIB: '8',
  NAGI_IMAGE_USER_AGENT: 'NagiImageResolverQA/1.0 (https://example.org/contact)',
  ...(process.env.NAGI_QA_IMAGES === '1' || process.env.NAGI_QA_ROUTES === '1'
    ? {
        MAPBOX_ENABLED: 'true',
        MAPBOX_ACCESS_TOKEN: 'fixture-server-token',
        NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'pk.fixture-browser-token',
      }
    : {}),
};
const child = spawn(
  process.execPath,
  [
    '--max-http-header-size=32768',
    '--import',
    new URL('./fixture.mjs', import.meta.url).href,
    'node_modules/next/dist/bin/next',
    'start',
    '--port',
    port,
  ],
  { cwd: root + '/apps/web', env, stdio: 'inherit' },
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 1));
