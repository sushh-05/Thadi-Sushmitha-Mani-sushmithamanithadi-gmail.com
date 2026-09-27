import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The SPA lives in web/ and builds to dist/, which server/index.js serves in
// production. In development the same server hosts Vite in middleware mode, so
// `npm run dev` is one process on one port.
export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
  },
});
