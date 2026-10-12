// İklim verisi: Open-Meteo geçmiş hava API'si (ERA5 reanalizi, 1940'tan bugüne günlük).
// Kaynak: https://open-meteo.com/en/docs/historical-weather-api
// Veri "Copernicus Climate Change Service" bilgileri kullanılarak üretilmiştir.

export interface City {
  id: string;
  name: string;
  /** Türkçe ilgi hâli: "İstanbul'un", "Ankara'nın" */
  genitive: string;
  latitude: number;
  longitude: number;
}

export const CITIES: City[] = [
  { id: 'istanbul', name: 'İstanbul', genitive: "İstanbul'un", latitude: 41.01, longitude: 28.98 },
  { id: 'ankara', name: 'Ankara', genitive: "Ankara'nın", latitude: 39.93, longitude: 32.86 },
  { id: 'izmir', name: 'İzmir', genitive: "İzmir'in", latitude: 38.42, longitude: 27.14 },
];

export const findCity = (id: string) => CITIES.find((c) => c.id === id.toLowerCase());

/**
 * Kompakt günlük seri: tarihler `start`'tan itibaren ardışık günlerdir, dizilerde tekrar edilmez.
 * Eksik gün `null`. Bu biçim statik anlık görüntünün boyutunu yarıya indirir.
 */
export interface ClimateData {
  city: string;
  name: string;
  latitude: number;
  longitude: number;
  model: string;
  fetchedAt: string;
  sample?: boolean;
  start: string; // YYYY-MM-DD
  tmean: (number | null)[];
  tmax: (number | null)[];
  tmin: (number | null)[];
  precip: (number | null)[];
}

export const BASE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY = ['temperature_2m_mean', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'] as const;

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  daily?: { time: string[] } & Partial<Record<(typeof DAILY)[number], (number | null)[]>>;
  error?: boolean;
  reason?: string;
}

const round1 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

/** Tek bir Open-Meteo cevabını kompakt biçimin parçalarına çevirir. */
export function parseOpenMeteo(json: OpenMeteoResponse) {
  if (json.error || !json.daily) throw new Error(`Open-Meteo hatası: ${json.reason ?? 'daily verisi yok'}`);
  const d = json.daily;
  return {
    time: d.time,
    tmean: (d.temperature_2m_mean ?? []).map(round1),
    tmax: (d.temperature_2m_max ?? []).map(round1),
    tmin: (d.temperature_2m_min ?? []).map(round1),
    precip: (d.precipitation_sum ?? []).map(round1),
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tarih aralığını en fazla `years` yıllık parçalara böler (tek dev istek yerine birkaç küçük istek). */
export function splitRange(start: string, end: string, years = 20): [string, string][] {
  const out: [string, string][] = [];
  let from = start;
  while (from <= end) {
    const y = Number(from.slice(0, 4)) + years;
    const chunkEnd = `${y - 1}-12-31`;
    const to = chunkEnd < end ? chunkEnd : end;
    out.push([from, to]);
    from = addDays(to, 1);
  }
  return out;
}

export async function fetchClimate(
  city: City,
  {
    start = '1940-01-01',
    end = addDays(new Date().toISOString().slice(0, 10), -2),
    chunkYears = 20,
    fetchImpl = fetch as typeof fetch,
    /** 429 (dakikalık limit) gelirse kaç kez bekleyip tekrar denensin */
    retries = 6,
    retryDelayMs = 61_000,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    onRetry = (_attempt: number, _reason: string) => {},
  } = {},
): Promise<ClimateData> {
  const parts = [];
  for (const [from, to] of splitRange(start, end, chunkYears)) {
    const url = new URL(BASE_URL);
    url.search = new URLSearchParams({
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      start_date: from,
      end_date: to,
      daily: DAILY.join(','),
      models: 'era5', // çok on yıllık analiz için tutarlı tek model
      timezone: 'auto',
    }).toString();
    // Not: Open-Meteo uzun aralıkları birden çok "istek" sayar; dakikalık limite takılırsa bekleyip tekrar dener.
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url.toString(), { headers: { 'user-agent': 'viz-lab' } });
      if (res.status === 429 && attempt < retries) {
        onRetry(attempt + 1, await res.text());
        await sleep(retryDelayMs);
        continue;
      }
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
      parts.push(parseOpenMeteo((await res.json()) as OpenMeteoResponse));
      break;
    }
  }

  const merged = {
    time: parts.flatMap((p) => p.time),
    tmean: parts.flatMap((p) => p.tmean),
    tmax: parts.flatMap((p) => p.tmax),
    tmin: parts.flatMap((p) => p.tmin),
    precip: parts.flatMap((p) => p.precip),
  };
  // ERA5 birkaç gün gecikmeli; sondaki boş günleri at
  let n = merged.tmean.length;
  while (n > 0 && merged.tmean[n - 1] == null) n--;

  return {
    city: city.id,
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    model: 'ERA5',
    fetchedAt: new Date().toISOString(),
    start: merged.time[0],
    tmean: merged.tmean.slice(0, n),
    tmax: merged.tmax.slice(0, n),
    tmin: merged.tmin.slice(0, n),
    precip: merged.precip.slice(0, n),
  };
}

/** Son tarih (YYYY-MM-DD). */
export const lastDate = (d: ClimateData) => addDays(d.start, d.tmean.length - 1);

/**
 * Artımlı güncelleme: `update`'in kapsadığı günler `base` üzerine yazılır, sonrası eklenir.
 * Günlük çalışmada 86 yılı yeniden çekmek yerine sadece son haftalar çekilir.
 */
export function mergeClimate(base: ClimateData, update: ClimateData): ClimateData {
  const offset = Math.round((Date.parse(update.start) - Date.parse(base.start)) / 86_400_000);
  if (offset < 0) throw new Error('Güncelleme mevcut verinin başlangıcından önce başlıyor');
  if (offset > base.tmean.length) throw new Error('Güncelleme ile mevcut veri arasında boşluk var');
  const merge = (a: (number | null)[], b: (number | null)[]) => [...a.slice(0, offset), ...b];
  return {
    ...base,
    fetchedAt: update.fetchedAt,
    sample: undefined,
    tmean: merge(base.tmean, update.tmean),
    tmax: merge(base.tmax, update.tmax),
    tmin: merge(base.tmin, update.tmin),
    precip: merge(base.precip, update.precip),
  };
}

// ---------------------------------------------------------------------------
// Dönüşümler (saf fonksiyonlar)
// ---------------------------------------------------------------------------

export interface DayPoint {
  date: string;
  year: number;
  doy: number; // yılın günü, 1..366
  value: number | null;
}

export function dayOfYear(date: string): number {
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((d - Date.UTC(+date.slice(0, 4), 0, 1)) / 86_400_000) + 1;
}

/** Kompakt diziyi tarihli noktalara açar. */
export function expand(start: string, values: (number | null)[]): DayPoint[] {
  const out: DayPoint[] = [];
  let date = start;
  for (const value of values) {
    out.push({ date, year: +date.slice(0, 4), doy: dayOfYear(date), value });
    date = addDays(date, 1);
  }
  return out;
}

export interface YearStat {
  year: number;
  mean: number;
  days: number; // geçerli gün sayısı
  partial: boolean; // yıl eksikse (ör. içinde bulunulan yıl) ortalamaya güvenilmez
  anomaly: number; // referans döneme göre fark (°C)
}

export const BASELINE: [number, number] = [1961, 1990]; // WMO'nun klasik referans dönemi

/** Yıllık ortalamalar ve referans dönemine göre anomaliler. */
export function yearlyAnomalies(points: DayPoint[], baseline = BASELINE, minDays = 330): { years: YearStat[]; baselineMean: number } {
  const acc = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    if (p.value == null) continue;
    const a = acc.get(p.year) ?? { sum: 0, n: 0 };
    a.sum += p.value;
    a.n += 1;
    acc.set(p.year, a);
  }
  const rows = [...acc.entries()].sort(([a], [b]) => a - b).map(([year, a]) => ({ year, mean: a.sum / a.n, days: a.n, partial: a.n < minDays }));
  const base = rows.filter((r) => !r.partial && r.year >= baseline[0] && r.year <= baseline[1]);
  const baselineMean = base.length ? base.reduce((s, r) => s + r.mean, 0) / base.length : NaN;
  return { baselineMean, years: rows.map((r) => ({ ...r, anomaly: r.mean - baselineMean })) };
}

/** Merkezlenmemiş (geriye dönük) hareketli ortalama; pencere dolmadan ve eksik değerde null döner. */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    if (slice.some((v) => v == null)) return null;
    return (slice as number[]).reduce((s, v) => s + v, 0) / window;
  });
}

/**
 * Yılın her günü için referans dönemi "normali" (1..366). Gürültüyü azaltmak için
 * ±15 günlük dairesel hareketli ortalama ile yumuşatılır (31 Aralık → 1 Ocak sarar).
 */
export function dailyNormals(points: DayPoint[], baseline = BASELINE, halfWindow = 15): number[] {
  const sum = Array(367).fill(0) as number[];
  const cnt = Array(367).fill(0) as number[];
  for (const p of points) {
    if (p.value == null || p.year < baseline[0] || p.year > baseline[1]) continue;
    sum[p.doy] += p.value;
    cnt[p.doy] += 1;
  }
  // 366. gün (artık yıl) çok az örneğe sahip, 365. günle birleştir
  const raw = Array.from({ length: 366 }, (_, i) => {
    const d = i + 1;
    if (d === 366) return cnt[365] + cnt[366] ? (sum[365] + sum[366]) / (cnt[365] + cnt[366]) : NaN;
    return cnt[d] ? sum[d] / cnt[d] : NaN;
  });
  return raw.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = -halfWindow; k <= halfWindow; k++) {
      const v = raw[(i + k + 366) % 366];
      if (!Number.isNaN(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : NaN;
  });
}

/** Her günün kendi takvim gününün normaline göre sapması (takvim ısı haritası için). */
export function dailyAnomalies(points: DayPoint[], normals: number[]): (number | null)[] {
  return points.map((p) => (p.value == null ? null : Math.round((p.value - normals[p.doy - 1]) * 10) / 10));
}

/** Sayfanın ihtiyaç duyduğu her şeyi tek seferde üretir (API ve statik mod aynı fonksiyonu kullanır). */
export function climateBundle(data: ClimateData, rollingWindow = 10) {
  const points = expand(data.start, data.tmean);
  const { years, baselineMean } = yearlyAnomalies(points);
  const complete = years.filter((y) => !y.partial);
  const rolling = rollingMean(complete.map((y) => y.anomaly), rollingWindow);
  const normals = dailyNormals(points);
  const anomalies = dailyAnomalies(points, normals);

  const lastComplete = complete.at(-1);
  const warmest = [...complete].sort((a, b) => b.mean - a.mean).slice(0, 5);
  const firstDecade = complete.slice(0, 10);
  const lastDecade = complete.slice(-10);
  const avg = (rows: YearStat[]) => rows.reduce((s, r) => s + r.mean, 0) / rows.length;

  return {
    city: data.city,
    name: data.name,
    model: data.model,
    fetchedAt: data.fetchedAt,
    sample: Boolean(data.sample),
    start: data.start,
    end: points.at(-1)?.date ?? data.start,
    baseline: BASELINE,
    baselineMean,
    rollingWindow,
    years: years.map((y) => ({ ...y, mean: round2(y.mean), anomaly: round2(y.anomaly) })),
    rolling: complete.map((y, i) => ({ year: y.year, value: rolling[i] == null ? null : round2(rolling[i]!) })),
    highlights: {
      lastCompleteYear: lastComplete ? { year: lastComplete.year, anomaly: round2(lastComplete.anomaly) } : null,
      warmestYears: warmest.map((y) => ({ year: y.year, mean: round2(y.mean) })),
      decadeChange: firstDecade.length && lastDecade.length ? round2(avg(lastDecade) - avg(firstDecade)) : null,
      firstDecade: firstDecade.length ? [firstDecade[0].year, firstDecade.at(-1)!.year] : null,
      lastDecade: lastDecade.length ? [lastDecade[0].year, lastDecade.at(-1)!.year] : null,
    },
    /** Takvim ısı haritası: `start`'tan itibaren günlük sapmalar (°C) */
    daily: anomalies,
  };
}

export type ClimateBundle = ReturnType<typeof climateBundle>;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Token/ağ olmadan çalışmak için gerçekçi sentetik veri:
 * mevsimsel dalga + yavaş ısınma trendi + gürültü. Gerçek ölçüm değildir.
 */
export function makeSampleClimate(city: City = CITIES[0], end = '2026-10-08', seed = 7): ClimateData {
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const tmean: number[] = [];
  const tmax: number[] = [];
  const tmin: number[] = [];
  const precip: number[] = [];
  let date = '1940-01-01';
  let weather = 0; // günler arası ilişkili sapma (sıcak/soğuk dalgalar)
  while (date <= end) {
    const year = +date.slice(0, 4);
    const doy = dayOfYear(date);
    const seasonal = 14.5 - 9.5 * Math.cos((2 * Math.PI * (doy - 20)) / 365.25);
    const trend = year < 1980 ? 0 : (year - 1980) * 0.045;
    weather = 0.8 * weather + gauss() * 1.4;
    const mean = seasonal + trend + weather;
    tmean.push(round1(mean)!);
    tmax.push(round1(mean + 4 + rand() * 2)!);
    tmin.push(round1(mean - 4 - rand() * 2)!);
    precip.push(rand() < 0.3 ? round1(rand() ** 2 * 25)! : 0);
    date = addDays(date, 1);
  }
  return { city: city.id, name: city.name, latitude: city.latitude, longitude: city.longitude, model: 'sentetik', fetchedAt: `${end}T00:00:00.000Z`, sample: true, start: '1940-01-01', tmean, tmax, tmin, precip };
}
