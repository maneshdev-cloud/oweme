import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` exists to make Next fail the build if a server module
      // sneaks into a client bundle. Under Node it just throws on import, so
      // tests swap it for an empty module — the queries themselves are exactly
      // the same code the server runs.
      'server-only': path.resolve(__dirname, './tests/helpers/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: 'default',
  },
});
