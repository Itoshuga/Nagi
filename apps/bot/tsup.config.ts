import { defineConfig } from 'tsup';
import { access, mkdir } from 'node:fs/promises';
export default defineConfig({
  entry: ['src/index.ts', 'src/commands/**/*.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  splitting: true,
  clean: true,
  sourcemap: true,
  external: ['discord.js'],
  noExternal: ['@nagi/shared', '@nagi/permissions', '@nagi/database', '@nagi/discord'],
  async onSuccess() {
    await access('src/commands');
    await mkdir('dist/commands', { recursive: true });
  },
});
