import { describe, it, expect, vi } from 'vitest';
import {
  addDays, dayOfYear, splitRange, expand, yearlyAnomalies, rollingMean, dailyNormals, dailyAnomalies,
  parseOpenMeteo, fetchClimate, climateBundle, makeSampleClimate, mergeClimate, lastDate, CITIES,
} from '../src';

describe('tarih yardımcıları', () => {
  it('addDays ay ve yıl sınırlarını geçer', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
  });

  it('dayOfYear artık yılı doğru sayar', () => {
    expect(dayOfYear('2024-01-01')).toBe(1);
    expect(dayOfYear('2024-12-31')).toBe(366);
    expect(dayOfYear('2023-12-31')).toBe(365);
  });

  it('splitRange aralığı boşluksuz ve çakışmasız böler', () => {
    const parts = splitRange('1940-01-01', '2000-06-30', 20);
    expect(parts).toEqual([
      ['1940-01-01', '1959-12-31'],
      ['1960-01-01', '1979-12-31'],
      ['1980-01-01', '1999-12-31'],
      ['2000-01-01', '2000-06-30'],
    ]);
  });
});

describe('yearlyAnomalies', () => {
  // 1961-1990 her gün 10°C, 2000 yılı her gün 12°C, 2001 sadece 10 gün
  const days = (_year: number, value: number, n = 365) => Array.from({ length: n }, () => value);
  const series = [...Array.from({ length: 30 }, (_, i) => days(1961 + i, 10)).flat()];

  it('referans dönemi ortalamasını ve anomaliyi hesaplar', () => {
    const points = [
      ...expand('1961-01-01', series),
    ];
    // 1961-1990 arası 30 yıl * 365 gün; artık yıllar yüzünden takvim kayar ama değer sabit
    const { baselineMean, years } = yearlyAnomalies(points);
    expect(baselineMean).toBeCloseTo(10);
    expect(years.filter((y) => !y.partial).every((y) => Math.abs(y.anomaly) < 1e-9)).toBe(true);
  });

  it('eksik yılı partial olarak işaretler', () => {
    const points = expand('2001-01-01', days(2001, 15, 10));
    const { years } = yearlyAnomalies(points);
    expect(years[0]).toMatchObject({ year: 2001, days: 10, partial: true });
  });

  it('null değerleri atlar', () => {
    const { years } = yearlyAnomalies(expand('2020-01-01', [1, null, 3]), [2020, 2020], 1);
    expect(years[0].mean).toBe(2);
    expect(years[0].days).toBe(2);
  });
});

describe('rollingMean', () => {
  it('pencere dolana kadar null, sonra ortalama', () => {
    expect(rollingMean([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('pencerede eksik değer varsa null', () => {
    expect(rollingMean([1, null, 3, 5], 2)).toEqual([null, null, null, 4]);
  });
});

describe('dailyNormals & dailyAnomalies', () => {
  const sample = makeSampleClimate();
  const points = expand(sample.start, sample.tmean);
  const normals = dailyNormals(points);

  it('366 günlük, sonlu normaller üretir', () => {
    expect(normals).toHaveLength(366);
    expect(normals.every(Number.isFinite)).toBe(true);
  });

  it('yaz normali kış normalinden yüksektir (mevsimsellik)', () => {
    expect(normals[200]).toBeGreaterThan(normals[15] + 10);
  });

  it('yıl başı ve sonu arasında sıçrama yok (dairesel yumuşatma)', () => {
    expect(Math.abs(normals[0] - normals[365])).toBeLessThan(1);
  });

  it('anomali = değer - o günün normali', () => {
    const anomalies = dailyAnomalies(points, normals);
    const i = 1000;
    expect(anomalies[i]).toBeCloseTo(points[i].value! - normals[points[i].doy - 1], 1);
  });
});

describe('parseOpenMeteo & fetchClimate', () => {
  const response = (time: string[], values: (number | null)[]) => ({
    latitude: 41,
    longitude: 29,
    daily: {
      time,
      temperature_2m_mean: values,
      temperature_2m_max: values.map((v) => (v == null ? null : v + 5)),
      temperature_2m_min: values.map((v) => (v == null ? null : v - 5)),
      precipitation_sum: values.map(() => 0.04),
    },
  });

  it('değerleri 1 ondalığa yuvarlar', () => {
    const p = parseOpenMeteo(response(['2024-01-01'], [12.345]));
    expect(p.tmean).toEqual([12.3]);
    expect(p.precip).toEqual([0]);
  });

  it('API hata cevabında anlamlı hata fırlatır', () => {
    expect(() => parseOpenMeteo({ latitude: 0, longitude: 0, error: true, reason: 'bad date' })).toThrow('bad date');
  });

  it('parçalı istekleri birleştirir ve sondaki boş günleri atar', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response(['1999-12-30', '1999-12-31'], [1, 2]))))
      .mockResolvedValueOnce(new Response(JSON.stringify(response(['2000-01-01', '2000-01-02'], [3, null]))));
    const data = await fetchClimate(CITIES[0], { start: '1999-12-30', end: '2000-01-02', chunkYears: 1, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(data.start).toBe('1999-12-30');
    expect(data.tmean).toEqual([1, 2, 3]);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get('models')).toBe('era5');
    expect(url.searchParams.get('daily')).toContain('temperature_2m_mean');
  });

  it('429 gelince bekleyip tekrar dener', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response(['2020-01-01'], [5]))));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const data = await fetchClimate(CITIES[0], { start: '2020-01-01', end: '2020-01-01', fetchImpl, sleep, retryDelayMs: 10 });
    expect(sleep).toHaveBeenCalledWith(10);
    expect(data.tmean).toEqual([5]);
  });

  it('deneme hakkı bitince 429 hatası fırlatır', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response('limit', { status: 429 })));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchClimate(CITIES[0], { start: '2020-01-01', end: '2020-01-01', fetchImpl, sleep, retries: 2 })).rejects.toThrow('429');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('HTTP hatasını iletir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    await expect(fetchClimate(CITIES[0], { start: '2020-01-01', end: '2020-01-02', fetchImpl })).rejects.toThrow('500');
  });
});

describe('climateBundle', () => {
  const bundle = climateBundle(makeSampleClimate());

  it('her yıl için anomali, tam yıllar için hareketli ortalama verir', () => {
    expect(bundle.years[0].year).toBe(1940);
    expect(bundle.rolling.slice(0, 9).every((r) => r.value === null)).toBe(true);
    expect(bundle.rolling[9].value).not.toBeNull();
  });

  it('içinde bulunulan (eksik) yılı partial işaretler', () => {
    expect(bundle.years.at(-1)).toMatchObject({ year: 2026, partial: true });
  });

  it('sentetik ısınma trendini yakalar', () => {
    expect(bundle.highlights.decadeChange!).toBeGreaterThan(1);
  });

  it('günlük anomali dizisi günlük veriyle aynı uzunlukta', () => {
    expect(bundle.daily.length).toBe(makeSampleClimate().tmean.length);
  });
});

describe('mergeClimate', () => {
  const base = { ...makeSampleClimate(CITIES[0], '1940-01-10'), sample: false };

  it('çakışan günleri günceller ve yenilerini ekler', () => {
    const update = { ...base, start: '1940-01-09', tmean: [100, 101, 102], tmax: [1, 1, 1], tmin: [0, 0, 0], precip: [0, 0, 0], fetchedAt: 'x' };
    const merged = mergeClimate(base, update);
    expect(merged.tmean.length).toBe(11);
    expect(merged.tmean.slice(8)).toEqual([100, 101, 102]);
    expect(merged.tmean.slice(0, 8)).toEqual(base.tmean.slice(0, 8));
    expect(lastDate(merged)).toBe('1940-01-11');
    expect(merged.fetchedAt).toBe('x');
  });

  it('boşluk varsa hata verir', () => {
    const update = { ...base, start: '1940-02-01' };
    expect(() => mergeClimate(base, update)).toThrow('boşluk');
  });
});
