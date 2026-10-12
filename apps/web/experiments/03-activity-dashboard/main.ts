import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { getSummary, getWeekdays, getMonthly, describeSource } from '../../lib/data';
import { showError } from '../../lib/ui';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, SVGRenderer]);

const nf = (n: number, digits = 0) => n.toLocaleString('tr-TR', { maximumFractionDigits: digits });

try {
  const [summary, weekdays, monthly] = await Promise.all([getSummary(), getWeekdays(), getMonthly()]);
  document.querySelector('#summary')!.textContent = describeSource(summary);

  const tiles: [string, string][] = [
    ['Toplam katkı', nf(summary.totalContributions)],
    [`Aktif gün (${nf(summary.dayCount)} günde)`, nf(summary.activeDays)],
    ['Aktif gün ortalaması', nf(summary.averagePerActiveDay, 1)],
    ['En uzun seri', `${summary.streaks.longest} gün`],
    ['Güncel seri', `${summary.streaks.current} gün`],
    ['Toplam yıldız', nf(summary.totalStars)],
  ];
  document.querySelector('#tiles')!.innerHTML = tiles
    .map(([label, value]) => `<div class="card tile"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join('');

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const accent = dark ? '#4493f8' : '#0969da';
  const axis = { axisLine: { lineStyle: { color: dark ? '#3d444d' : '#d1d9e0' } }, axisLabel: { color: dark ? '#9198a1' : '#59636e' } };
  const split = { splitLine: { lineStyle: { color: dark ? '#262c36' : '#eaeef2' } } };
  const init = (id: string) => echarts.init(document.getElementById(id)!, undefined, { renderer: 'svg' });

  // Pazartesi'den başlat
  const ordered = [...weekdays.slice(1), weekdays[0]];
  const wd = init('weekdays');
  wd.setOption({
    grid: { left: 36, right: 8, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => nf(v, 2) },
    xAxis: { type: 'category', data: ordered.map((d) => d.short), ...axis },
    yAxis: { type: 'value', ...axis, ...split },
    series: [{ type: 'bar', data: ordered.map((d) => d.average), itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] }, barWidth: '55%' }],
  });

  const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const mo = init('monthly');
  mo.setOption({
    grid: { left: 40, right: 12, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: monthly.map((m) => monthFmt.format(new Date(`${m.month}-01`))), ...axis },
    yAxis: { type: 'value', ...axis, ...split },
    series: [{ type: 'line', data: monthly.map((m) => m.total), smooth: true, symbolSize: 6, lineStyle: { width: 2, color: accent }, itemStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.12 } }],
  });

  window.addEventListener('resize', () => [wd, mo].forEach((c) => c.resize()));
} catch (e) {
  showError(e);
}
