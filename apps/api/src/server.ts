import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';

// Repo kökündeki .env dosyasını (varsa) yükle
const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 8787);
const token = process.env.GITHUB_TOKEN || undefined;

const app = createApp({
  token,
  cacheTtlMs: Number(process.env.CACHE_TTL_SECONDS ?? 600) * 1000,
  cacheDir: process.env.CACHE_DIR ?? '.cache',
  log: true,
  climateSample: process.env.CLIMATE_SAMPLE === '1',
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`API → http://localhost:${port}/api/health  (${token ? 'canlı GitHub verisi' : 'örnek veri modu, GITHUB_TOKEN yok'})`);
});
