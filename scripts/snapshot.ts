// Statik GitHub Pages sürümü için veri anlık görüntüleri üretir (apps/web/public/data/).
//  - github.json:          GITHUB_TOKEN + GITHUB_LOGIN varsa gerçek veri, yoksa örnek
//  - climate-<şehir>.json: Open-Meteo (ERA5). Erişilemezse mevcut dosya korunur, hiç yoksa sentetik örnek yazılır.
// Sadece bir kısmını çalıştırmak için: npm run snapshot -- climate   (ya da: github)
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchGitHubData, makeSampleData, fetchClimate, makeSampleClimate, CITIES } from '@viz/core';

const outDir = resolve(import.meta.dirname, '../apps/web/public/data');
const only = process.argv[2];
const write = (name: string, data: unknown) => writeFileSync(resolve(outDir, name), JSON.stringify(data) + '\n');

if (!only || only === 'github') {
  const token = process.env.GITHUB_TOKEN;
  const login = process.env.GITHUB_LOGIN ?? process.env.GITHUB_REPOSITORY_OWNER;
  const data = token && login ? await fetchGitHubData(login, token) : makeSampleData();
  writeFileSync(resolve(outDir, 'github.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`✔ github: ${data.sample ? 'örnek' : '@' + data.login} · ${data.contributions.length} gün`);
}

if (!only || only === 'climate') {
  let failures = 0;
  for (const city of CITIES) {
    const file = `climate-${city.id}.json`;
    try {
      const data = await fetchClimate(city);
      write(file, data);
      console.log(`✔ iklim ${city.name}: ${data.start} → ${data.tmean.length} gün`);
    } catch (err) {
      failures++;
      console.warn(`✖ iklim ${city.name}: ${(err as Error).message}`);
      if (!existsSync(resolve(outDir, file))) {
        write(file, makeSampleClimate(city));
        console.warn(`  → mevcut dosya yok, sentetik örnek yazıldı`);
      }
    }
  }
  // CI'da tüm şehirler başarısızsa workflow kırmızı görünsün
  if (failures === CITIES.length && process.env.CI) process.exit(1);
}
