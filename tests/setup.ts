import { vi } from 'vitest';

// Next.js enforces this build-time boundary. Node tests exercise the server modules directly.
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
