import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BGE_SERVER lets a second dev pair run beside the default one (e.g. verification
// servers on 8899/5273 while another session holds 8787/5173).
const server = process.env.BGE_SERVER ?? 'localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/ws': { target: `ws://${server}`, ws: true },
      '/imported': `http://${server}`,
    },
  },
  build: {
    outDir: 'dist',
  },
});
