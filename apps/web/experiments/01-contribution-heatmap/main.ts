import * as d3 from 'd3';
import { getHeatmap, getSummary, describeSource } from '../../lib/data';
import { showError } from '../../lib/ui';

try {
  const [cells, summary] = await Promise.all([getHeatmap(), getSummary()]);
  document.querySelector('#summary')!.textContent =
    `${describeSource(summary)} · son bir yılda ${summary.totalContributions.toLocaleString('tr-TR')} katkı`;
  render(cells);
} catch (e) {
  showError(e);
}

function render(cells: Awaited<ReturnType<typeof getHeatmap>>) {
  const CELL = 12;
  const GAP = 3;
  const LEFT = 30;
  const TOP = 20;
  const weeks = d3.max(cells, (c) => c.week)! + 1;
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP) + 30;

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('role', 'img')
    .attr('aria-label', 'Günlük katkı ısı haritası');

  const dayNames = ['', 'Pzt', '', 'Çar', '', 'Cum', ''];
  svg
    .selectAll('text.day')
    .data(dayNames)
    .join('text')
    .attr('x', 0)
    .attr('y', (_, i) => TOP + i * (CELL + GAP) + CELL - 2)
    .attr('font-size', 10)
    .attr('fill', 'var(--muted)')
    .text((d) => d);

  // Ay etiketleri: her ayın 1'inin düştüğü haftaya yazılır
  const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: 'UTC' });
  svg
    .selectAll('text.month')
    .data(cells.filter((c) => c.date.endsWith('-01')))
    .join('text')
    .attr('x', (c) => LEFT + c.week * (CELL + GAP))
    .attr('y', TOP - 6)
    .attr('font-size', 10)
    .attr('fill', 'var(--muted)')
    .text((c) => monthFmt.format(new Date(c.date)));

  const tooltip = document.querySelector<HTMLDivElement>('#tooltip')!;
  const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  svg
    .selectAll('rect.day')
    .data(cells)
    .join('rect')
    .attr('x', (c) => LEFT + c.week * (CELL + GAP))
    .attr('y', (c) => TOP + c.weekday * (CELL + GAP))
    .attr('width', CELL)
    .attr('height', CELL)
    .attr('rx', 2)
    .attr('fill', (c) => `var(--lvl${c.level})`)
    .on('mousemove', (event: MouseEvent, c) => {
      tooltip.textContent = `${c.count} katkı · ${dateFmt.format(new Date(c.date))}`;
      tooltip.style.left = `${event.clientX + 10}px`;
      tooltip.style.top = `${event.clientY - 28}px`;
      tooltip.style.opacity = '1';
    })
    .on('mouseleave', () => (tooltip.style.opacity = '0'));

  const legend = svg.append('g').attr('transform', `translate(${width - 5 * (CELL + GAP) - 30}, ${height - 16})`);
  legend.append('text').attr('x', -4).attr('y', 10).attr('font-size', 10).attr('text-anchor', 'end').attr('fill', 'var(--muted)').text('Az');
  legend
    .selectAll('rect')
    .data([0, 1, 2, 3, 4])
    .join('rect')
    .attr('x', (d) => d * (CELL + GAP))
    .attr('width', CELL)
    .attr('height', CELL)
    .attr('rx', 2)
    .attr('fill', (d) => `var(--lvl${d})`);
  legend.append('text').attr('x', 5 * (CELL + GAP) + 2).attr('y', 10).attr('font-size', 10).attr('fill', 'var(--muted)').text('Çok');
}
