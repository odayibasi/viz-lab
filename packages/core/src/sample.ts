// Token olmadan da çalışabilmek için deterministik örnek veri üretir.
import type { GitHubData } from './types';

export function makeSampleData(login = 'sample-user', endDate = '2026-10-10', seed = 42): GitHubData {
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

  const end = new Date(`${endDate}T00:00:00Z`);
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
    forks: Math.floor(rand() ** 3 * 40),
    pushedAt: null,
    languages: langs
      .filter(() => rand() < 0.4)
      .map(([name, color]) => ({ name, color, size: Math.floor(rand() * 200_000) + 1_000 })),
  }));

  return { login, fetchedAt: end.toISOString(), sample: true, contributions, repos };
}
