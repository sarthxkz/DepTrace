import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dashboard:dev` serves the app with hot reload and forwards /api to a
// running "deptrace dashboard" (DEPTRACE_API, default http://127.0.0.1:7341).
const api = process.env.DEPTRACE_API ?? 'http://127.0.0.1:7341';

export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist/dashboard',
    emptyOutDir: true,
    target: 'es2022',
    // Cytoscape alone is ~400 kB; the app is loaded from localhost only.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: api,
        changeOrigin: true,
        // The server only accepts POSTs from its own origin.
        configure: (proxy) => {
          proxy.on('proxyReq', (request) => {
            if (request.getHeader('origin') !== undefined) request.setHeader('origin', api);
          });
        },
      },
    },
  },
});
