import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'src', 'client');

// The client root is src/client: private data, docs, the raw archive and server code are outside it
// and additionally denied. The client never imports data files; it fetches the protected API.
export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'shared') } },
  server: {
    fs: {
      strict: true,
      allow: [root, resolve(import.meta.dirname, 'shared'), resolve(import.meta.dirname, 'node_modules')],
      deny: ['.env', '.env.*', '**/data/**', '**/docs/**', '**/design/**', '**/*.zip', '**/*.md', '**/CONFIDENTIAL*'],
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist', 'client'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
