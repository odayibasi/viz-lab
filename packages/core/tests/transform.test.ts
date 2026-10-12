import { describe, it, expect } from 'vitest';
import {
  toHeatmapCells, contributionLevels, aggregateLanguages, totalContributions,
  streaks, weekdayDistribution, monthlyTotals, summarize, makeSampleData,
} from '../src';

const sample = makeSampleData();

describe('toHeatmapCells', () => {
  it('Pazar ile başlayan veride hafta/gün indekslerini doğru hesaplar', () => {
    // 2026-10-04 Pazar
    const cells = toHeatmapCells([
      { date: '2026-10-04', count: 1 },
      { date: '2026-10-10', count: 2 },
      { date: '2026-10-11', count: 3 },
    ]);
    expect(cells.map((c) => [c.week, c.weekday])).toEqual([[0, 0], [0, 6], [1, 0]]);
  });

  it('hafta ortasında başlayan veride ilk haftayı yarım sayar', () => {
    // 2026-10-07 Çarşamba, 2026-10-11 Pazar
    const cells = toHeatmapCells([
      { date: '2026-10-07', count: 1 },
      { date: '2026-10-11', count: 1 },
    ]);
    expect(cells[0]).toMatchObject({ week: 0, weekday: 3 });
    expect(cells[1]).toMatchObject({ week: 1, weekday: 0 });
  });

  it('sırasız girdiyi tarihe göre sıralar', () => {
    const cells = toHeatmapCells([
      { date: '2026-10-05', count: 1 },
      { date: '2026-10-04', count: 1 },
    ]);
    expect(cells[0].date).toBe('2026-10-04');
  });

  it('boş girdi için boş dizi döner', () => {
    expect(toHeatmapCells([])).toEqual([]);
  });
});

describe('contributionLevels', () => {
  it('0 her zaman seviye 0, en büyük değer seviye 4', () => {
    const level = contributionLevels([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(level(0)).toBe(0);
    expect(level(8)).toBe(4);
  });

  it('seviyeler artan değerlerle monoton artar', () => {
    const counts = [0, 1, 1, 2, 3, 5, 8, 13, 21];
    const level = contributionLevels(counts);
    const levels = counts.map(level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('hiç katkı yoksa her şey 0', () => {
    expect(contributionLevels([0, 0])(5)).toBe(0);
  });
});

describe('aggregateLanguages', () => {
  const repos = [
    { name: 'a', stars: 0, forks: 0, pushedAt: null, languages: [{ name: 'TS', color: '#111', size: 600 }, { name: 'CSS', color: '#222', size: 100 }] },
    { name: 'b', stars: 0, forks: 0, pushedAt: null, languages: [{ name: 'TS', color: '#111', size: 200 }, { name: 'Go', color: '#333', size: 100 }] },
  ];

  it('repolar arası dil byte larını toplar ve sıralar', () => {
    const res = aggregateLanguages(repos);
    expect(res.map((l) => [l.name, l.size])).toEqual([['TS', 800], ['CSS', 100], ['Go', 100]]);
  });

  it('paylar toplamı 1 eder', () => {
    const sum = aggregateLanguages(repos).reduce((s, l) => s + l.share, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('top sınırından sonrakileri "Diğer" altında birleştirir', () => {
    const res = aggregateLanguages(repos, 1);
    expect(res.map((l) => l.name)).toEqual(['TS', 'Diğer']);
    expect(res[1].size).toBe(200);
  });
});

describe('örnek veri', () => {
  it('şemaya uygun ve dönüşümlerden geçiyor', () => {
    expect(sample.contributions.length).toBeGreaterThan(300);
    expect(toHeatmapCells(sample.contributions).length).toBe(sample.contributions.length);
    expect(totalContributions(sample.contributions)).toBeGreaterThan(0);
    expect(aggregateLanguages(sample.repos).length).toBeGreaterThan(0);
  });
});

describe('streaks', () => {
  it('en uzun ve güncel seriyi bulur', () => {
    const days = [1, 1, 0, 1, 1, 1, 0, 1, 1].map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));
    expect(streaks(days)).toEqual({ longest: 3, current: 2 });
  });

  it('son gün boşsa güncel seri 0', () => {
    expect(streaks([{ date: '2026-01-01', count: 3 }, { date: '2026-01-02', count: 0 }]).current).toBe(0);
  });
});

describe('weekdayDistribution & monthlyTotals', () => {
  const days = [
    { date: '2026-10-04', count: 2 }, // Pazar
    { date: '2026-10-11', count: 4 }, // Pazar
    { date: '2026-10-05', count: 1 }, // Pazartesi
    { date: '2026-09-30', count: 5 },
  ];

  it('haftanın günlerine göre toplar ve ortalar', () => {
    const dist = weekdayDistribution(days);
    expect(dist).toHaveLength(7);
    expect(dist[0]).toMatchObject({ name: 'Pazar', total: 6, average: 3 });
    expect(dist[1].total).toBe(1);
  });

  it('aylara göre sıralı toplam verir', () => {
    expect(monthlyTotals(days)).toEqual([{ month: '2026-09', total: 5 }, { month: '2026-10', total: 7 }]);
  });
});

describe('summarize', () => {
  it('örnek veri için tutarlı özet üretir', () => {
    const s = summarize(sample);
    expect(s.totalContributions).toBe(totalContributions(sample.contributions));
    expect(s.activeDays).toBeLessThanOrEqual(s.dayCount);
    expect(s.topRepos.length).toBeLessThanOrEqual(5);
    expect(s.streaks.longest).toBeGreaterThanOrEqual(s.streaks.current);
    expect(s.sample).toBe(true);
  });
});
