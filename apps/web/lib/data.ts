// Frontend veri katmanı.
//  1) Backend varsa işlenmiş veriyi API'den alır (VITE_API_URL ya da dev'de Vite proxy'si).
//  2) Backend yoksa (ör. GitHub Pages) statik anlık görüntüyü yükler ve aynı işlemeyi tarayıcıda yapar.
// Böylece deneyler iki ortamda da aynı kodla çalışır.
import {
  summarize,
  toHeatmapCells,
  contributionLevels,
  aggregateLanguages,
  weekdayDistribution,
  monthlyTotals,
  type GitHubData,
} from '@viz/core';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const params = new URLSearchParams(location.search);

/** ?user=octocat ile hangi kullanıcının görüntüleneceği seçilir. */
export const login = params.get('user') ?? (import.meta.env.VITE_DEFAULT_USER as string | undefined) ?? 'octocat';

export type Source = 'api' | 'static';
let source: Source | null = null;
let snapshot: Promise<GitHubData> | null = null;

async function api<T>(path: string): Promise<T | null> {
  if (source === 'static') return null;
  let res: Response;
  try {
    res = await fetch(`${API}/api/users/${encodeURIComponent(login)}/${path}`);
  } catch {
    res = new Response(null, { status: 503 }); // ağ hatası: backend yok
  }
  const isJson = res.headers.get('content-type')?.includes('json');
  if (res.status === 404 && isJson) throw new Error(`@${login} bulunamadı`);
  if (!res.ok || !isJson) {
    source = 'static'; // backend yok (ör. GitHub Pages) → statik veriye düş
    return null;
  }
  source = 'api';
  return (await res.json()) as T;
}

function loadSnapshot(): Promise<GitHubData> {
  snapshot ??= fetch(`${import.meta.env.BASE_URL}data/github.json`).then((r) => r.json());
  return snapshot;
}

export const getSource = () => source;

export async function getSummary() {
  return (await api<ReturnType<typeof summarize>>('summary')) ?? summarize(await loadSnapshot());
}

export async function getHeatmap() {
  const fromApi = await api<(ReturnType<typeof toHeatmapCells>[number] & { level: number })[]>('heatmap');
  if (fromApi) return fromApi;
  const { contributions } = await loadSnapshot();
  const level = contributionLevels(contributions.map((d) => d.count));
  return toHeatmapCells(contributions).map((c) => ({ ...c, level: level(c.count) }));
}

export async function getLanguages(top = 6) {
  return (await api<ReturnType<typeof aggregateLanguages>>(`languages?top=${top}`)) ?? aggregateLanguages((await loadSnapshot()).repos, top);
}

export async function getWeekdays() {
  return (await api<ReturnType<typeof weekdayDistribution>>('weekdays')) ?? weekdayDistribution((await loadSnapshot()).contributions);
}

export async function getMonthly() {
  return (await api<ReturnType<typeof monthlyTotals>>('monthly')) ?? monthlyTotals((await loadSnapshot()).contributions);
}

/** Sayfa başlığının altındaki "kaynak" satırı. */
export function describeSource(summary: { login: string; sample: boolean }) {
  const where = source === 'api' ? 'backend API' : 'statik anlık görüntü';
  return `@${summary.login} · kaynak: ${where}${summary.sample ? ' (örnek veri)' : ''}`;
}
