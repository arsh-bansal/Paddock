import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/api': { target: `http://localhost:${process.env.API_PORT ?? 8787}`, changeOrigin: true },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
