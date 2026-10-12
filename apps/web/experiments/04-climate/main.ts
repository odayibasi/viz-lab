import * as d3 from 'd3';
import { addDays, type ClimateBundle } from '@viz/core';
import { CITIES, currentCity, loadClimate } from '../../lib/climate';
import { showError } from '../../lib/ui';

type Bundle = ClimateBundle;
type YearRow = Bundle['years'][number];

const city = currentCity();
const tooltip = document.querySelector<HTMLDivElement>('#tooltip')!;
const nf1 = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf1(Math.abs(v))} °C`;
const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

// ---------------------------------------------------------------------------
// Iraksak skala: soğuk (mavi) ↔ normal (gri) ↔ sıcak (kırmızı).
// Kollar eşit adımlı ve açıklıkları simetrik (OKLCH L ile kontrol edildi);
// koyu temada uçlar parlaklaşır, orta nokta koyu gri olur.
// ---------------------------------------------------------------------------
const RAMPS = {
  light: ['#104281', '#2a78d6', '#86b6ef', '#f0efec', '#f2a08f', '#d6453f', '#8f1d1d'],
  dark: ['#86b6ef', '#3987e5', '#1c5cab', '#383835', '#b8382f', '#e66767', '#f4a99c'],
};
function diverging(limit: number) {
  const colors = RAMPS[dark() ? 'dark' : 'light'];
  const domain = d3.range(7).map((i) => -limit + (i * limit) / 3);
  return d3.scaleLinear<string>().domain(domain).range(colors).interpolate(d3.interpolateLab).clamp(true);
}

function legendScale(el: HTMLElement, limit: number, unit = '°C') {
  const scale = diverging(limit);
  const stops = d3.range(0, 1.0001, 0.1).map((t) => `${scale(-limit + t * 2 * limit)} ${t * 100}%`);
  el.innerHTML = `<span>${signed(-limit).replace(' °C', '')} ${unit} daha soğuk</span><span class="bar" style="background:linear-gradient(90deg, ${stops.join(',')})"></span><span>+${nf1(limit)} ${unit} daha sıcak</span>`;
}

function showTip(html: string, x: number, y: number) {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  const w = tooltip.offsetWidth;
  tooltip.style.left = `${Math.min(x + 12, window.innerWidth - w - 8)}px`;
  tooltip.style.top = `${y - 36}px`;
}
const hideTip = () => (tooltip.style.opacity = '0');

// ---------------------------------------------------------------------------
// Sayfa iskeleti
// ---------------------------------------------------------------------------
document.querySelector('#city-picker')!.innerHTML = CITIES.map(
  (c) => `<a href="?city=${c.id}" ${c.id === city.id ? 'aria-current="page"' : ''}>${c.name}</a>`,
).join('');
document.querySelector('#city-title')!.textContent = city.genitive;
document.title = `${city.name} iklimi · Viz Lab`;

try {
  const { bundle, source } = await loadClimate(city.id);
  render(bundle, source);
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => render(bundle, source), 150);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render(bundle, source));
} catch (e) {
  showError(e);
}

function render(b: Bundle, source: 'api' | 'static') {
  const complete = b.years.filter((y) => !y.partial);
  const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  document.querySelector('#summary')!.innerHTML =
    `${complete[0]?.year}–${complete.at(-1)?.year} arası günlük ortalama sıcaklık` +
    (b.sample ? ' · <strong class="warning">sentetik örnek veri, gerçek ölçüm değil</strong>' : `, ${b.model} reanalizi`);
  document.querySelectorAll('.baseline-label').forEach((el) => (el.textContent = `${b.baseline[0]}–${b.baseline[1]}`));
  document.querySelectorAll('.rolling-label').forEach((el) => (el.textContent = `${b.rollingWindow} yıllık`));

  renderTiles(b);
  renderStripes(complete, b);
  renderAnomaly(complete, b);
  renderCalendar(b);
  renderTable(b);

  document.querySelector('#source')!.innerHTML =
    (b.sample
      ? `Bu sürüm sentetik örnek veri gösteriyor (mevsimsel dalga + trend + gürültü); gerçek veri <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo</a>'dan çekildiğinde değişir. `
      : `Veri: <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo Historical Weather API</a> (${b.model}), ` +
        `Copernicus Climate Change Service bilgileri kullanılarak üretilmiştir. ` +
        `Değerler yaklaşık 25 km'lik bir ızgara hücresinin ortalamasıdır, tek bir istasyonun ölçümü değildir; ` +
        `1940'lar az gözlem nedeniyle daha belirsizdir, bu yüzden "ilk 10 yıl" karşılaştırması temkinli okunmalıdır. `) +
    `Konum ${b.name}, ${fmtDate(b.start)} – ${fmtDate(b.end)}. ` +
    `Kaynak: ${source === 'api' ? 'backend API' : 'statik anlık görüntü'}, güncellenme ${fmtDate(b.fetchedAt.slice(0, 10))}.`;
}

// ---------------------------------------------------------------------------
// Özet kutucukları
// ---------------------------------------------------------------------------
function renderTiles(b: Bundle) {
  const h = b.highlights;
  const tiles = [
    h.decadeChange != null && {
      label: `Son 10 yıl, ilk 10 yıla göre`,
      value: signed(h.decadeChange),
      note: `${h.lastDecade![0]}–${h.lastDecade![1]} ile ${h.firstDecade![0]}–${h.firstDecade![1]} ortalaması`,
    },
    h.warmestYears[0] && {
      label: 'Kayıtlardaki en sıcak yıl',
      value: String(h.warmestYears[0].year),
      note: `Ortalama ${nf1(h.warmestYears[0].mean)} °C · sonraki: ${h.warmestYears.slice(1, 4).map((y) => y.year).join(', ')}`,
    },
    h.lastCompleteYear && {
      label: `${h.lastCompleteYear.year} yılı sapması`,
      value: signed(h.lastCompleteYear.anomaly),
      note: `${b.baseline[0]}–${b.baseline[1]} ortalamasına (${nf1(b.baselineMean)} °C) göre`,
    },
  ].filter(Boolean) as { label: string; value: string; note: string }[];
  document.querySelector('#tiles')!.innerHTML = tiles
    .map((t) => `<div class="card tile"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="note">${t.note}</div></div>`)
    .join('');
}

// ---------------------------------------------------------------------------
// 1) Isınma şeritleri: eksen yok, sadece renk. Renk sınırı simetrik ve en büyük sapmaya göre.
// ---------------------------------------------------------------------------
function renderStripes(years: YearRow[], b: Bundle) {
  const el = document.querySelector<HTMLDivElement>('#stripes')!;
  el.innerHTML = '';
  const width = el.clientWidth;
  const height = Math.max(120, Math.min(220, width * 0.22));
  const limit = Math.ceil(d3.max(years, (y) => Math.abs(y.anomaly))! * 2) / 2;
  const color = diverging(limit);
  const x = d3.scaleBand<number>().domain(years.map((y) => y.year)).range([0, width]).paddingInner(0);

  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${width} ${height + 20}`)
    .attr('role', 'img').attr('aria-label', `${b.name} ısınma şeritleri, ${years[0].year}–${years.at(-1)!.year}`);

  svg.append('g').selectAll('rect').data(years).join('rect')
    .attr('x', (d) => x(d.year)!).attr('width', x.bandwidth() + 0.5) // +0.5: şeritler arasında piksel boşluğu kalmasın
    .attr('height', height).attr('fill', (d) => color(d.anomaly))
    .on('mousemove', (e: MouseEvent, d) => showTip(`<strong>${d.year}</strong> · ${signed(d.anomaly)} (ortalama ${nf1(d.mean)} °C)`, e.clientX, e.clientY))
    .on('mouseleave', hideTip);

  // Sadece on yıl başlarında küçük etiketler
  svg.append('g').attr('transform', `translate(0,${height + 14})`).selectAll('text')
    .data(years.filter((y) => y.year % 20 === 0)).join('text')
    .attr('x', (d) => x(d.year)! + x.bandwidth() / 2).attr('text-anchor', 'middle').text((d) => d.year);

  legendScale(document.querySelector('#stripes-legend')!, limit);
}

// ---------------------------------------------------------------------------
// 2) Anomali çubukları + hareketli ortalama. Tek eksen (°C sapma), sıfır çizgisi vurgulu.
// ---------------------------------------------------------------------------
function renderAnomaly(years: YearRow[], b: Bundle) {
  const el = document.querySelector<HTMLDivElement>('#anomaly')!;
  el.innerHTML = '';
  const width = el.clientWidth;
  const height = Math.max(240, Math.min(340, width * 0.38));
  const m = { top: 24, right: 12, bottom: 26, left: 44 };
  const rolling = new Map(b.rolling.map((r) => [r.year, r.value]));

  const x = d3.scaleBand<number>().domain(years.map((y) => y.year)).range([m.left, width - m.right]).paddingInner(0.25);
  const [lo, hi] = d3.extent(years, (y) => y.anomaly) as [number, number];
  const y = d3.scaleLinear().domain([Math.min(lo, -0.5), Math.max(hi, 0.5)]).nice().range([height - m.bottom, m.top]);

  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img').attr('aria-label', `${b.name} yıllık sıcaklık sapması ve ${b.rollingWindow} yıllık ortalama`);

  // Izgara ve eksenler (silik)
  svg.append('g').selectAll('line').data(y.ticks(6)).join('line')
    .attr('x1', m.left).attr('x2', width - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
    .attr('stroke', 'var(--grid)');
  svg.append('g').selectAll('text').data(y.ticks(6)).join('text')
    .attr('x', m.left - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
    .text((d) => (d === 0 ? '0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`));
  svg.append('text').attr('x', m.left - 8).attr('y', 10).attr('text-anchor', 'end').text('°C');
  const xStep = width < 560 ? 20 : 10;
  svg.append('g').selectAll('text').data(years.filter((d) => d.year % xStep === 0)).join('text')
    .attr('x', (d) => x(d.year)! + x.bandwidth() / 2).attr('y', height - 8).attr('text-anchor', 'middle').text((d) => d.year);

  // Çubuklar: işarete göre sıcak/soğuk, uçları yuvarlatılmış, sıfıra bağlı
  const r = Math.min(2, x.bandwidth() / 2);
  svg.append('g').selectAll('path').data(years).join('path')
    .attr('fill', (d) => (d.anomaly >= 0 ? 'var(--warm)' : 'var(--cool)'))
    .attr('d', (d) => roundedBar(x(d.year)!, y(0), x.bandwidth(), y(d.anomaly) - y(0), r));

  svg.append('line').attr('x1', m.left).attr('x2', width - m.right).attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', 'var(--muted)').attr('stroke-width', 1);

  // Hareketli ortalama: nötr mürekkep rengi, 2px
  const line = d3.line<YearRow>()
    .defined((d) => rolling.get(d.year) != null)
    .x((d) => x(d.year)! + x.bandwidth() / 2)
    .y((d) => y(rolling.get(d.year)!))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(years).attr('d', line).attr('fill', 'none')
    .attr('stroke', 'var(--ink)').attr('stroke-width', 2).attr('stroke-linejoin', 'round');

  // Son noktaya doğrudan etiket
  const last = [...years].reverse().find((d) => rolling.get(d.year) != null);
  if (last) {
    // Etiketi son 15 yılın en yüksek çubuğunun üstüne koy, kenarına arka plan rengi "hale" ver
    const recent = years.slice(-15);
    const top = d3.max(recent, (d) => Math.max(d.anomaly, rolling.get(d.year) ?? -Infinity))!;
    svg.append('text').attr('x', width - m.right).attr('y', Math.max(14, y(top) - 12))
      .attr('text-anchor', 'end').attr('class', 'direct-label')
      .text(`${b.rollingWindow} yıllık ort. ${signed(rolling.get(last.year)!)}`);
  }

  // Hover: yıla yapışan dikey kılavuz çizgisi + ipucu
  const guide = svg.append('line').attr('y1', m.top).attr('y2', height - m.bottom)
    .attr('stroke', 'var(--muted)').attr('stroke-dasharray', '3 3').style('opacity', 0);
  svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', width - m.left - m.right).attr('height', height - m.top - m.bottom)
    .attr('fill', 'transparent')
    .on('mousemove', (e: MouseEvent) => {
      const [px] = d3.pointer(e);
      const i = Math.max(0, Math.min(years.length - 1, Math.floor((px - m.left) / x.step())));
      const d = years[i];
      const cx = x(d.year)! + x.bandwidth() / 2;
      guide.attr('x1', cx).attr('x2', cx).style('opacity', 1);
      const rv = rolling.get(d.year);
      showTip(`<strong>${d.year}</strong> · sapma ${signed(d.anomaly)}${rv != null ? `<br>${b.rollingWindow} yıllık ort. ${signed(rv)}` : ''}`, e.clientX, e.clientY);
    })
    .on('mouseleave', () => {
      guide.style('opacity', 0);
      hideTip();
    });

  document.querySelector('#anomaly-legend')!.innerHTML =
    `<span class="key"><span class="swatch" style="background:var(--warm)"></span>Ortalamadan sıcak yıl</span>` +
    `<span class="key"><span class="swatch" style="background:var(--cool)"></span>Ortalamadan soğuk yıl</span>` +
    `<span class="key"><span class="line"></span>${b.rollingWindow} yıllık hareketli ortalama</span>`;
}

/** Sıfır çizgisine bağlı, sadece uç tarafı yuvarlatılmış çubuk. h<0 ise yukarı doğru. */
function roundedBar(x: number, y0: number, w: number, h: number, r: number) {
  if (Math.abs(h) < r * 2) return `M${x},${y0}h${w}v${h}h${-w}Z`;
  const dir = h < 0 ? -1 : 1;
  const end = y0 + h;
  return `M${x},${y0}V${end - dir * r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end - dir * r}V${y0}Z`;
}

// ---------------------------------------------------------------------------
// 3) Takvim ısı haritası: ~31.000 hücre. SVG yerine Canvas (tek çizim, hızlı).
// ---------------------------------------------------------------------------
function renderCalendar(b: Bundle) {
  const el = document.querySelector<HTMLDivElement>('#calendar')!;
  el.innerHTML = '';
  const firstYear = +b.start.slice(0, 4);
  const lastYear = +b.end.slice(0, 4);
  const rows = lastYear - firstYear + 1;
  const LEFT = 40;
  const TOP = 18;
  const width = el.clientWidth;
  const cellW = (width - LEFT) / 366;
  const cellH = Math.max(3, Math.min(6, Math.round(cellW * 2.2)));
  const height = TOP + rows * cellH;
  const limit = 8;
  const color = diverging(limit);
  const empty = dark() ? '#151b23' : '#f6f8fa';

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${b.name} için ${firstYear}–${lastYear} günlük sıcaklık sapması ısı haritası`);
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = empty;
  ctx.fillRect(LEFT, TOP, width - LEFT, rows * cellH);

  // Günleri yerleştir: satır = yıl, sütun = yılın günü
  const cells: { date: string; value: number | null }[][] = Array.from({ length: rows }, () => []);
  let date = b.start;
  for (const v of b.daily) {
    const year = +date.slice(0, 4);
    const doy = Math.round((Date.UTC(year, +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(year, 0, 1)) / 86_400_000);
    cells[year - firstYear][doy] = { date, value: v };
    if (v != null) {
      ctx.fillStyle = color(v);
      ctx.fillRect(LEFT + doy * cellW, TOP + (year - firstYear) * cellH, Math.ceil(cellW), cellH);
    }
    date = addDays(date, 1);
  }

  // Ay ve yıl etiketleri
  const ink = getComputedStyle(document.body).getPropertyValue('--muted') || '#59636e';
  ctx.fillStyle = ink;
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  months.forEach((mName, i) => {
    if (width < 560 && i % 2) return; // dar ekranda iki ayda bir etiket
    const doy = Math.round((Date.UTC(2001, i, 1) - Date.UTC(2001, 0, 1)) / 86_400_000);
    ctx.fillText(mName, LEFT + doy * cellW, TOP - 6);
  });
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let yr = firstYear; yr <= lastYear; yr++) {
    if (yr % 10 === 0) ctx.fillText(String(yr), LEFT - 6, TOP + (yr - firstYear) * cellH + cellH / 2);
  }

  // Hover: imleç altındaki günü bul (DOM düğümü yok, koordinattan hesap)
  const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - LEFT) / cellW);
    const row = Math.floor((e.clientY - rect.top - TOP) / cellH);
    const cell = cells[row]?.[col];
    if (!cell || cell.value == null) return hideTip();
    showTip(`<strong>${dateFmt.format(new Date(`${cell.date}T00:00:00Z`))}</strong><br>normale göre ${signed(cell.value)}`, e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', hideTip);

  legendScale(document.querySelector('#calendar-legend')!, limit);
}

// ---------------------------------------------------------------------------
// Erişilebilirlik: aynı verinin tablo görünümü
// ---------------------------------------------------------------------------
function renderTable(b: Bundle) {
  const rolling = new Map(b.rolling.map((r) => [r.year, r.value]));
  const rows = [...b.years].reverse().map((y) =>
    `<tr><td>${y.year}${y.partial ? ' (eksik)' : ''}</td><td>${nf1(y.mean)}</td><td>${signed(y.anomaly)}</td><td>${rolling.get(y.year) != null ? signed(rolling.get(y.year)!) : '–'}</td></tr>`,
  );
  document.querySelector('#table')!.innerHTML =
    `<div class="scroll"><table><thead><tr><th>Yıl</th><th>Ortalama °C</th><th>Sapma</th><th>${b.rollingWindow} yıllık ort.</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
