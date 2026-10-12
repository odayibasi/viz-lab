// HTTP katmanı. Sunucudan bağımsız tutuldu: testler `app.request()` ile ağ açmadan çalışır,
// aynı uygulama Node, Bun, Deno veya Cloudflare Workers üzerinde de çalıştırılabilir.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import {
  fetchGitHubData,
  makeSampleData,
  GitHubError,
  summarize,
  toHeatmapCells,
  contributionLevels,
  aggregateLanguages,
  weekdayDistribution,
  monthlyTotals,
  CITIES,
  findCity,
  fetchClimate,
  makeSampleClimate,
  climateBundle,
  type GitHubData,
  type ClimateData,
} from '@viz/core';
import { TtlCache } from './cache';

export interface AppOptions {
  /** GitHub token. Yoksa API örnek veriyle çalışır. */
  token?: string;
  cacheTtlMs?: number;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  log?: boolean;
  /** true ise iklim verisi Open-Meteo yerine sentetik örnekten gelir (ağsız geliştirme/test). */
  climateSample?: boolean;
  climateTtlMs?: number;
}

// GitHub kullanıcı adı kuralları: harf/rakam/tire, en fazla 39 karakter
const LOGIN_RE = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export function createApp(opts: AppOptions = {}) {
  const cache = new TtlCache<GitHubData>(opts.cacheTtlMs ?? 10 * 60_000, opts.cacheDir);
  const mode = opts.token ? 'live' : 'sample';
  const app = new Hono();

  if (opts.log) app.use('*', logger());
  app.use('/api/*', cors());

  app.get('/api/health', (c) => c.json({ ok: true, mode, climate: opts.climateSample ? 'sample' : 'live' }));

  // Her kullanıcı endpoint'i önce ham veriyi (cache'li) yükler, sonra işler.
  const users = new Hono<{ Variables: { data: GitHubData } }>();

  users.use('/:login/*', async (c, next) => {
    const login = c.req.param('login');
    if (!LOGIN_RE.test(login)) return c.json({ error: 'Geçersiz kullanıcı adı' }, 400);

    const force = c.req.query('refresh') === '1';
    try {
      const { value, hit } = await cache.get(
        login.toLowerCase(),
        () => (opts.token ? fetchGitHubData(login, opts.token, opts.fetchImpl) : Promise.resolve(makeSampleData(login))),
        { force },
      );
      c.set('data', value);
      c.header('X-Cache', hit ? 'HIT' : 'MISS');
      c.header('X-Data-Mode', mode);
      await next();
    } catch (err) {
      if (err instanceof GitHubError) {
        // 404 kullanıcıya aynen iletilir; token/limit gibi upstream hataları 502 olur
        return c.json({ error: err.message }, err.status === 404 ? 404 : 502);
      }
      throw err;
    }
  });

  users.get('/:login/raw', (c) => c.json(c.get('data')));

  users.get('/:login/summary', (c) => c.json(summarize(c.get('data'))));

  users.get('/:login/heatmap', (c) => {
    const { contributions } = c.get('data');
    const level = contributionLevels(contributions.map((d) => d.count));
    return c.json(toHeatmapCells(contributions).map((cell) => ({ ...cell, level: level(cell.count) })));
  });

  users.get('/:login/languages', (c) => {
    const top = Math.min(20, Math.max(1, Number(c.req.query('top') ?? 6) || 6));
    return c.json(aggregateLanguages(c.get('data').repos, top));
  });

  users.get('/:login/weekdays', (c) => c.json(weekdayDistribution(c.get('data').contributions)));

  users.get('/:login/monthly', (c) => c.json(monthlyTotals(c.get('data').contributions)));

  app.route('/api/users', users);

  // --- İklim (Open-Meteo / ERA5) -------------------------------------------
  // Geçmiş veri günde bir güncellendiği için uzun süre cache'lenir.
  const climateCache = new TtlCache<ClimateData>(opts.climateTtlMs ?? 24 * 3_600_000, opts.cacheDir && `${opts.cacheDir}/climate`);
  const loadClimate = (id: string, force: boolean) => {
    const city = findCity(id)!;
    return climateCache.get(
      city.id,
      () => (opts.climateSample ? Promise.resolve(makeSampleClimate(city)) : fetchClimate(city, { fetchImpl: opts.fetchImpl })),
      { force },
    );
  };

  app.get('/api/climate/cities', (c) => c.json(CITIES));

  app.get('/api/climate/:city/:view?', async (c) => {
    const { city, view = 'bundle' } = c.req.param();
    if (!findCity(city)) return c.json({ error: `Bilinmeyen şehir: ${city}`, cities: CITIES.map((x) => x.id) }, 404);
    if (view !== 'bundle' && view !== 'raw') return c.json({ error: 'Bulunamadı' }, 404);
    try {
      const { value, hit } = await loadClimate(city, c.req.query('refresh') === '1');
      c.header('X-Cache', hit ? 'HIT' : 'MISS');
      return c.json(view === 'raw' ? value : climateBundle(value));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'İklim verisi alınamadı' }, 502);
    }
  });

  app.notFound((c) => c.json({ error: 'Bulunamadı' }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Sunucu hatası' }, 500);
  });

  return app;
}
