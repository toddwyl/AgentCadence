import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3712',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3712',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
});
