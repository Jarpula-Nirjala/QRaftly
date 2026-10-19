import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, reportCompressedSize: false },
  server: { proxy: { '/api': 'http://localhost:3000', '/r': 'http://localhost:3000' } },
});
