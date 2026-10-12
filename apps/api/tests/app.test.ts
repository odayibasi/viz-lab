import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app';
import { TtlCache } from '../src/cache';

describe('API (örnek veri modu)', () => {
  const app = createApp();

  it('health endpoint modu bildirir', async () => {
    const res = await app.request('/api/health');
    expect(await res.json()).toMatchObject({ ok: true, mode: 'sample' });
  });

  it('summary işlenmiş istatistik döner', async () => {
    const res = await app.request('/api/users/octocat/summary');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ login: 'octocat', sample: true });
    expect(body.totalContributions).toBeGreaterThan(0);
  });

  it('heatmap hücreleri seviye bilgisi içerir', async () => {
    const cells = await (await app.request('/api/users/octocat/heatmap')).json();
    expect(cells[0]).toHaveProperty('level');
    expect(cells.every((c: { level: number }) => c.level >= 0 && c.level <= 4)).toBe(true);
  });

  it('languages top parametresine uyar', async () => {
    const langs = await (await app.request('/api/users/octocat/languages?top=2')).json();
    expect(langs.length).toBeLessThanOrEqual(3); // 2 + "Diğer"
  });

  it('weekdays 7 gün, monthly sıralı ay listesi döner', async () => {
    expect(await (await app.request('/api/users/octocat/weekdays')).json()).toHaveLength(7);
    const monthly = await (await app.request('/api/users/octocat/monthly')).json();
    expect(monthly[0].month <= monthly.at(-1).month).toBe(true);
  });

  it('ikinci istek cache\'ten gelir', async () => {
    const fresh = createApp();
    expect((await fresh.request('/api/users/abc/raw')).headers.get('X-Cache')).toBe('MISS');
    expect((await fresh.request('/api/users/abc/summary')).headers.get('X-Cache')).toBe('HIT');
    expect((await fresh.request('/api/users/abc/raw?refresh=1')).headers.get('X-Cache')).toBe('MISS');
  });

  it('geçersiz kullanıcı adında 400 döner', async () => {
    expect((await app.request('/api/users/-bad-/summary')).status).toBe(400);
  });

  it('CORS başlığı ekler', async () => {
    const res = await app.request('/api/health', { headers: { Origin: 'https://example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('API (canlı mod, GitHub mock)', () => {
  it('kullanıcı yoksa 404 iletir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { user: null }, errors: [{ type: 'NOT_FOUND', message: 'x' }] })),
    );
    const app = createApp({ token: 't', fetchImpl });
    expect((await app.request('/api/users/nobody/summary')).status).toBe(404);
  });

  it('upstream hatasında 502 döner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 403 }));
    const app = createApp({ token: 't', fetchImpl });
    expect((await app.request('/api/users/someone/summary')).status).toBe(502);
  });
});

describe('TtlCache', () => {
  it('süresi dolunca yeniden yükler', async () => {
    let t = 0;
    const cache = new TtlCache<number>(1000, undefined, () => t);
    const loader = vi.fn().mockResolvedValue(1);
    await cache.get('k', loader);
    await cache.get('k', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    t = 2000;
    await cache.get('k', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('eşzamanlı istekleri tek çağrıda birleştirir', async () => {
    const cache = new TtlCache<number>(1000);
    const loader = vi.fn(() => new Promise<number>((r) => setTimeout(() => r(7), 10)));
    const results = await Promise.all([cache.get('k', loader), cache.get('k', loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.value)).toEqual([7, 7]);
  });
});

describe('İklim API', () => {
  const app = createApp({ climateSample: true });

  it('şehir listesini döner', async () => {
    const cities = await (await app.request('/api/climate/cities')).json();
    expect(cities.map((c: { id: string }) => c.id)).toContain('istanbul');
  });

  it('işlenmiş paket: yıllık anomaliler, hareketli ortalama, günlük sapmalar', async () => {
    const res = await app.request('/api/climate/istanbul');
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({ city: 'istanbul', sample: true, baseline: [1961, 1990] });
    expect(b.years.length).toBeGreaterThan(80);
    expect(b.daily.length).toBeGreaterThan(30000);
    expect(b.rolling[9].value).not.toBeNull();
  });

  it('raw görünümü kompakt seriyi döner ve cache kullanır', async () => {
    const fresh = createApp({ climateSample: true });
    const first = await fresh.request('/api/climate/ankara/raw');
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect((await first.json()).tmean.length).toBeGreaterThan(30000);
    expect((await fresh.request('/api/climate/ankara')).headers.get('X-Cache')).toBe('HIT');
  });

  it('bilinmeyen şehirde 404', async () => {
    expect((await app.request('/api/climate/paris')).status).toBe(404);
    expect((await app.request('/api/climate/istanbul/xyz')).status).toBe(404);
  });

  it('kaynak hatasında 502', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const live = createApp({ fetchImpl });
    expect((await live.request('/api/climate/izmir')).status).toBe(502);
  });
});
