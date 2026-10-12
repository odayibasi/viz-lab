# GitHub Viz Lab

GitHub verisi üzerinde görselleştirme denemeleri ve testleri için bir oyun alanı.
Her deney `experiments/` altında bağımsız bir sayfa; hepsi aynı veri dosyasını ve aynı test edilmiş dönüşüm fonksiyonlarını kullanır.

## Stack

| Katman | Araç |
| --- | --- |
| Dil / build | TypeScript, Vite (çok sayfalı) |
| Veri | GitHub GraphQL API, `@octokit/graphql` |
| Görselleştirme | D3.js, Apache ECharts (yenileri eklenebilir: Observable Plot, Three.js…) |
| Test | Vitest |
| CI / yayın | GitHub Actions → GitHub Pages |

## Başlangıç

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # birim testleri
```

Repo, token gerektirmeden çalışsın diye `data/github.json` içinde **örnek veri** ile gelir.

### Kendi verini çekmek

```bash
cp .env.example .env     # GITHUB_TOKEN ve GITHUB_LOGIN doldur
npm run fetch-data:local
```

Örnek veriye geri dönmek için: `npm run sample-data`

## Yapı

```
experiments/
  01-contribution-heatmap/   D3 ile GitHub tarzı katkı ızgarası
  02-language-donut/         ECharts ile dil dağılımı
src/lib/
  types.ts                   veri şeması
  transform.ts               saf dönüşüm fonksiyonları (test edilir)
scripts/
  fetch-data.ts              GraphQL → data/github.json
  make-sample.ts             deterministik örnek veri
tests/                       Vitest testleri
.github/workflows/
  deploy.yml                 test + build + Pages deploy
  fetch-data.yml             günlük veri güncelleme (cron)
```

## Yeni deney eklemek

1. `experiments/03-adi/` klasörü aç, içine `index.html` ve `main.ts` koy (mevcut bir deneyi kopyalamak en hızlısı).
2. Veri hazırlığını `src/lib/transform.ts` içine fonksiyon olarak yaz, `tests/` altında testini ekle.
3. Ana sayfadaki (`index.html`) galeriye bir kart ekle.

Vite, `experiments/` altındaki her `index.html` dosyasını otomatik olarak build'e dahil eder.

## GitHub Pages

Repo ayarlarında **Settings → Pages → Source: GitHub Actions** seç. `main`'e her push'ta testler çalışır ve site `https://<kullanici>.github.io/github-viz-lab/` adresine yayınlanır.

Günlük veri güncellemesi için isteğe bağlı olarak **Settings → Secrets and variables → Actions** altında `GH_DATA_TOKEN` secret'ı ve `GITHUB_LOGIN` değişkeni tanımlayabilirsin; tanımlamazsan repo sahibinin verisi varsayılan token ile çekilir.

## Deney fikirleri

- Contributor ağı (D3 force layout)
- Haftanın günü × saat commit yoğunluğu
- PR açılıştan merge'e geçen süre dağılımı
- Star geçmişi zaman serisi
- 3D "commit şehri" (Three.js)
- README için otomatik üretilen SVG istatistik kartı
