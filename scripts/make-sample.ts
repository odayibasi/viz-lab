// Token olmadan da çalışabilmek için deterministik örnek veri üretir.
// Kullanım: npx tsx scripts/make-sample.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GitHubData } from '../src/lib/types';

// Basit seed'li rastgele sayı üreteci (her çalıştırmada aynı veri)
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

const end = new Date('2026-10-10T00:00:00Z');
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 364);
start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // Pazar'a hizala

const contributions = [];
for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const busy = rand() < (weekend ? 0.3 : 0.75);
  const count = busy ? Math.floor(rand() ** 2 * (weekend ? 6 : 14)) + 1 : 0;
  contributions.push({ date: d.toISOString().slice(0, 10), count });
}

const langs = [
  ['TypeScript', '#3178c6'], ['JavaScript', '#f1e05a'], ['Python', '#3572A5'],
  ['Go', '#00ADD8'], ['CSS', '#563d7c'], ['HTML', '#e34c26'], ['Shell', '#89e051'], ['Rust', '#dea584'],
] as const;

const repos = Array.from({ length: 12 }, (_, i) => ({
  name: `sample-repo-${i + 1}`,
  stars: Math.floor(rand() ** 3 * 300),
  languages: langs
    .filter(() => rand() < 0.4)
    .map(([name, color]) => ({ name, color, size: Math.floor(rand() * 200_000) + 1_000 })),
}));

const data: GitHubData = { login: 'sample-user', fetchedAt: end.toISOString(), sample: true, contributions, repos };
writeFileSync(resolve(import.meta.dirname, '../data/github.json'), JSON.stringify(data, null, 2) + '\n');
console.log('✔ örnek veri → data/github.json');
