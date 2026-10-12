// Saf veri dönüşüm fonksiyonları. DOM'a dokunmaz, bu yüzden kolayca test edilir.
import type { ContributionDay, RepoSummary } from './types';

export interface HeatmapCell extends ContributionDay {
  week: number; // 0'dan başlayan hafta indeksi
  weekday: number; // 0 = Pazar ... 6 = Cumartesi
}

/** Günlük katkıları GitHub tarzı (hafta x gün) ızgara hücrelerine çevirir. */
export function toHeatmapCells(days: ContributionDay[]): HeatmapCell[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const start = parseUTC(sorted[0].date);
  const startOffset = start.getUTCDay(); // ilk hafta yarım olabilir
  return sorted.map((d) => {
    const dayIndex = Math.round((parseUTC(d.date).getTime() - start.getTime()) / 86_400_000);
    const weekday = parseUTC(d.date).getUTCDay();
    return { ...d, weekday, week: Math.floor((dayIndex + startOffset) / 7) };
  });
}

/** Katkı sayılarını GitHub gibi 0-4 arası seviyelere böler (çeyreklik eşiklerle). */
export function contributionLevels(counts: number[]): (count: number) => 0 | 1 | 2 | 3 | 4 {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return () => 0;
  const q = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(p * nonZero.length))];
  const [t1, t2, t3] = [q(0.25), q(0.5), q(0.75)];
  return (count) => {
    if (count <= 0) return 0;
    if (count <= t1) return 1;
    if (count <= t2) return 2;
    if (count <= t3) return 3;
    return 4;
  };
}

export interface LanguageShare {
  name: string;
  color: string | null;
  size: number;
  share: number; // 0-1
}

/**
 * Tüm repolardaki dil byte'larını toplar, büyükten küçüğe sıralar.
 * `top` sayısından sonrakileri "Diğer" altında birleştirir.
 */
export function aggregateLanguages(repos: RepoSummary[], top = 6): LanguageShare[] {
  const totals = new Map<string, { color: string | null; size: number }>();
  for (const repo of repos) {
    for (const lang of repo.languages) {
      const prev = totals.get(lang.name);
      totals.set(lang.name, { color: prev?.color ?? lang.color, size: (prev?.size ?? 0) + lang.size });
    }
  }
  const all = [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.size - a.size);
  const grand = all.reduce((s, l) => s + l.size, 0);
  if (grand === 0) return [];

  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length > 0) {
    head.push({ name: 'Diğer', color: null, size: rest.reduce((s, l) => s + l.size, 0) });
  }
  return head.map((l) => ({ ...l, share: l.size / grand }));
}

export function totalContributions(days: ContributionDay[]): number {
  return days.reduce((s, d) => s + d.count, 0);
}

function parseUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
