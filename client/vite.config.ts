import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.BGE_SERVER ?? 'localhost:8790';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    proxy: {
      '/ws': { target: `ws://${server}`, ws: true },
      '/api': `http://${server}`,
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
