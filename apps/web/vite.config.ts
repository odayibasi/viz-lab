import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// experiments/<klasör>/index.html dosyalarını otomatik olarak sayfa olarak ekler.
// Yeni deney eklemek için sadece yeni bir klasör açman yeterli.
const root = __dirname;
const expDir = resolve(root, 'experiments');
const experimentPages = Object.fromEntries(
  readdirSync(expDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(expDir, d.name, 'index.html')))
    .map((d) => [d.name, resolve(expDir, d.name, 'index.html')]),
);

export default defineConfig({
  // GitHub Pages alt yolunda (/<repo>/) da çalışması için workflow BASE değişkenini set eder.
  base: process.env.BASE ?? '/',
  server: {
    // Geliştirmede /api istekleri yerel backend'e gider (npm run dev ikisini birlikte başlatır)
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  build: {
    target: 'es2022', // top-level await için
    rollupOptions: {
      input: { main: resolve(root, 'index.html'), ...experimentPages },
    },
  },
});
