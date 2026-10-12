# Viz Lab

GitHub verisi üzerinde görselleştirme denemeleri ve testleri için bir oyun alanı.
TypeScript bir **backend** GitHub'dan veriyi çeker, işler ve cache'ler; **frontend** deneyleri bu işlenmiş veriyi D3 / ECharts ile çizer.

```
┌──────────────┐   GraphQL    ┌──────────────────────┐   JSON    ┌──────────────────────┐
│  GitHub API  │ ───────────▶ │  apps/api  (Hono)    │ ────────▶ │  apps/web  (Vite)    │
└──────────────┘              │  cache + işleme      │           │  D3, ECharts deneyleri│
                              └──────────┬───────────┘           └──────────▲───────────┘
                                         │  packages/core: tipler, GitHub     │
                                         └── istemcisi, saf dönüşümler ───────┘
```

## Stack

| Katman | Araç |
| --- | --- |
| Monorepo | npm workspaces, TypeScript |
| Backend | [Hono](https://hono.dev) + Node, TTL cache (bellek + disk) |
| Ortak kod | `@viz/core`: tipler, GitHub GraphQL istemcisi, dönüşümler |
| Frontend | Vite (çok sayfalı), D3.js, Apache ECharts |
| Test | Vitest (core + API, ağ olmadan) |
| CI / yayın | GitHub Actions → GitHub Pages, Dockerfile (API) |

## Başlangıç

```bash
npm install
npm run dev      # API → :8787, web → :5173 (Vite /api isteklerini backend'e proxy'ler)
npm test
```

Token olmadan da çalışır: API örnek veri moduna geçer. Gerçek veri için:

```bash
cp .env.example .env   # GITHUB_TOKEN doldur
npm run dev
```

Sonra `http://localhost:5173/?user=odayibasi` gibi istediğin kullanıcıyı aç.

## API

| Endpoint | Ne döner |
| --- | --- |
| `GET /api/health` | `{ ok, mode: "live" \| "sample" }` |
| `GET /api/users/:login/raw` | Ham veri (katkılar + repolar) |
| `GET /api/users/:login/summary` | Toplam, aktif gün, seriler, en iyi gün, en çok yıldızlı repolar |
| `GET /api/users/:login/heatmap` | Hafta/gün ızgarası, 0–4 yoğunluk seviyesi |
| `GET /api/users/:login/languages?top=6` | Dillerin byte payı (kalanlar "Diğer") |
| `GET /api/users/:login/weekdays` | Haftanın günlerine göre toplam/ortalama |
| `GET /api/users/:login/monthly` | Aylık toplam katkı |

Her yanıtta `X-Cache: HIT|MISS` başlığı bulunur; `?refresh=1` cache'i atlar. Varsayılan cache süresi 10 dakikadır (`CACHE_TTL_SECONDS`).

## Yapı

```
packages/core/          ortak tipler, GitHub istemcisi, dönüşümler (+ testler)
apps/api/               Hono backend (+ testler, Dockerfile)
apps/web/
  experiments/01-...    D3 contribution heatmap
  experiments/02-...    ECharts dil dağılımı
  experiments/03-...    Aktivite paneli (backend özetleri)
  lib/data.ts           veri katmanı: önce API, yoksa statik anlık görüntü
  public/data/          statik anlık görüntü (GitHub Pages için)
scripts/snapshot.ts     statik anlık görüntüyü üretir
```

## Yeni deney eklemek

1. Veri işleme gerekiyorsa `packages/core/src/transform.ts`'e saf bir fonksiyon ve testini ekle.
2. Backend'de `apps/api/src/app.ts` içine endpoint ekle (bir satır), `apps/web/lib/data.ts`'e karşılığını yaz.
3. `apps/web/experiments/04-adi/` altına `index.html` + `main.ts` koy; Vite onu otomatik olarak build'e alır.
4. Ana sayfaya (`apps/web/index.html`) bir kart ekle.

## Yayınlama

**Frontend (GitHub Pages):** Repo ayarlarında **Settings → Pages → Source: GitHub Actions** seç. `main`'e her push'ta test, typecheck ve build çalışır. Backend yoksa site statik anlık görüntüyle çalışır; bu görüntü her gün `Refresh static snapshot` workflow'u ile yenilenir.

**Backend:** Docker çalıştıran herhangi bir yere (Render, Fly.io, Railway, kendi sunucun) koyabilirsin:

```bash
docker build -f apps/api/Dockerfile -t viz-lab-api .
docker run -p 8787:8787 -e GITHUB_TOKEN=xxx viz-lab-api
```

Ardından repo değişkeni olarak `VITE_API_URL=https://senin-api-adresin` tanımla; Pages sürümü bundan sonra backend'i kullanır.

## Deney fikirleri

- Contributor ağı (D3 force layout)
- Haftanın günü × saat commit yoğunluğu (commit zaman damgaları için yeni endpoint)
- PR açılıştan merge'e geçen süre dağılımı
- Star geçmişi zaman serisi
- 3D "commit şehri" (Three.js)
- README için backend'in ürettiği SVG istatistik kartı
