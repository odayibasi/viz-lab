// Statik GitHub Pages sürümü için veri anlık görüntüleri üretir (apps/web/public/data/).
//  - github.json:          GITHUB_TOKEN + GITHUB_LOGIN varsa gerçek veri, yoksa örnek
//  - climate-<şehir>.json: Open-Meteo (ERA5). Erişilemezse mevcut dosya korunur, hiç yoksa sentetik örnek yazılır.
// Sadece bir kısmını çalıştırmak için: npm run snapshot -- climate   (ya da: github)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  fetchGitHubData, makeSampleData, fetchClimate, makeSampleClimate, mergeClimate, lastDate, addDays, CITIES,
  type ClimateData,
} from '@viz/core';

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
    const path = resolve(outDir, file);
    const existing: ClimateData | null = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    const onRetry = (n: number) => console.log(`  ${city.name}: dakikalık limit, 1 dk bekleniyor (deneme ${n})`);
    try {
      let data: ClimateData;
      if (existing && !existing.sample && process.env.CLIMATE_FULL !== '1') {
        // Artımlı: son 30 günü yeniden çek (ERA5 son günleri sonradan düzeltebilir) ve birleştir
        const update = await fetchClimate(city, { start: addDays(lastDate(existing), -30), onRetry });
        data = mergeClimate(existing, update);
        console.log(`✔ iklim ${city.name}: artımlı güncelleme → ${lastDate(data)} (${data.tmean.length} gün)`);
      } else {
        data = await fetchClimate(city, { onRetry });
        console.log(`✔ iklim ${city.name}: tam çekim ${data.start} → ${lastDate(data)} (${data.tmean.length} gün)`);
      }
      write(file, data);
    } catch (err) {
      failures++;
      const msg = `${(err as Error).message}${(err as Error).cause ? ` (cause: ${String((err as Error).cause)})` : ''}`;
      console.warn(`✖ iklim ${city.name}: ${msg}`);
      // GitHub Actions'ta hata özetini annotation olarak da yaz (API'den okunabilir)
      if (process.env.GITHUB_ACTIONS) console.log(`::warning title=iklim ${city.id}::${msg.slice(0, 500).replace(/\r?\n/g, ' ')}`);
      if (!existing) {
        write(file, makeSampleClimate(city));
        console.warn(`  → mevcut dosya yok, sentetik örnek yazıldı`);
      }
    }
  }
  // CI'da tüm şehirler başarısızsa workflow kırmızı görünsün
  if (failures === CITIES.length && process.env.CI) process.exit(1);
}
