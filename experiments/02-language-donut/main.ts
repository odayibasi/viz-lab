// Tree-shaking: sadece kullanılan ECharts parçalarını içe aktar (~1 MB → ~300 KB)
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([PieChart, TooltipComponent, LegendComponent, SVGRenderer]);
import raw from '../../data/github.json';
import type { GitHubData } from '../../src/lib/types';
import { aggregateLanguages } from '../../src/lib/transform';

const data = raw as GitHubData;
const shares = aggregateLanguages(data.repos, 6);

document.querySelector('#summary')!.textContent =
  `@${data.login} · ${data.repos.length} repo, ${shares.length} dil grubu` + (data.sample ? ' (örnek veri)' : '');

const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const chart = echarts.init(document.querySelector<HTMLDivElement>('#chart')!, dark ? 'dark' : undefined, {
  renderer: 'svg',
});

chart.setOption({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    formatter: (p: { name: string; percent: number; value: number }) =>
      `${p.name}<br/>%${p.percent.toFixed(1)} · ${(p.value / 1024).toFixed(0)} KB`,
  },
  legend: { orient: 'vertical', right: 10, top: 'middle' },
  series: [
    {
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['38%', '50%'],
      itemStyle: { borderRadius: 4, borderColor: dark ? '#151b23' : '#f6f8fa', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', formatter: '{b}\n{d}%' } },
      data: shares.map((l) => ({
        name: l.name,
        value: l.size,
        itemStyle: { color: l.color ?? (dark ? '#59636e' : '#afb8c1') },
      })),
    },
  ],
});

window.addEventListener('resize', () => chart.resize());
