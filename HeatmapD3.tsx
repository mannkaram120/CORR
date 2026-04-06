import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { useNexusStore } from '../../store/nexusStore';
import { INSTRUMENT_MAP } from '../../data/instruments';
import { hierarchicalCluster } from '../../utils/clustering';
import type { MatrixViewMode } from '../../types';

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  row: string;
  col: string;
  r: number;
  beta: number;
  sigmaRatio: number;
  pValue: number;
  nObs: number;
  trendDelta: number;   // current r − baseline (1Y) r
  viewMode: MatrixViewMode;
  causalityText: string;
}

// Color for a correlation value (soft pastel palette matching reference)
function corrColor(r: number): string {
  const neutral = '#1a1e28';
  if (Math.abs(r) < 0.001) return neutral;
  if (r < 0) return d3.interpolateRgb(neutral, '#dc2626')(Math.abs(r));  // vivid red
  return d3.interpolateRgb(neutral, '#16a34a')(r);  // vivid green
}

function betaColor(beta: number): string {
  const neutral = '#f5f0e8'; // centered at β = 1.0
  const red = '#cc2200';
  const blue = '#1d4ed8';
  if (!Number.isFinite(beta)) return neutral;
  if (Math.abs(beta - 1) < 0.001) return neutral;
  if (beta >= 1) {
    const t = Math.max(0, Math.min(1, (beta - 1) / 1)); // β=2 => deep blue
    return d3.interpolateRgb(neutral, blue)(t);
  }
  // beta < 1: fade toward red; beta <= -1 treated as fully saturated
  const t = Math.max(0, Math.min(1, (1 - beta) / 2)); // β=-1 => 1
  return d3.interpolateRgb(neutral, red)(t);
}

function computeMargin(n: number) {
  // Labels like 'USDCAD' at font-size 11px need ~55px + 8px gap = 63px minimum
  // Add extra breathing room so nothing clips at any screen width
  const top  = Math.max(50, Math.min(80, 32 + n));
  const left = Math.max(64, Math.min(90, 42 + n));
  return { top, right: 12, bottom: 12, left };
}

export function HeatmapD3() {
  const svgRef     = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const matrix         = useNexusStore(s => s.matrix);
  const baselineMatrix = useNexusStore(s => s.baselineMatrix);
  const betaMatrix     = useNexusStore(s => s.betaMatrix);
  const viewMode       = useNexusStore(s => s.viewMode);
  const activeScenario = useNexusStore(s => s.activeScenario);
  const scenarioMatrix = useNexusStore(s => s.scenarioMatrix);
  const portfolioMode  = useNexusStore(s => s.portfolioMode);
  const portfolioWeights = useNexusStore(s => s.portfolioWeights);
  const clusterMode    = useNexusStore(s => s.clusterMode);
  const threshold      = useNexusStore(s => s.threshold);
  const anomalyMode    = useNexusStore(s => s.anomalyMode);
  const causalityMode  = useNexusStore(s => s.causalityMode);
  const causalityMatrix = useNexusStore(s => s.causalityMatrix);
  const causalityStatus = useNexusStore(s => s.causalityStatus);
  const flashAlerts    = useNexusStore(s => s.flashAlerts);
  const selectPair     = useNexusStore(s => s.selectPair);
  const selectedPair   = useNexusStore(s => s.selectedPair);

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, row: '', col: '', r: 0, pValue: 1, nObs: 0, trendDelta: 0,
    beta: 1, sigmaRatio: 1, viewMode: 'corr', causalityText: '',
  });

  const [dims, setDims] = useState({ width: 600, height: 600 });
  const isFirst = useRef(true);

  // Single reliable sizing effect using offsetWidth/offsetHeight
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 50 && h > 50) {
        setDims({ width: Math.max(200, w - 8), height: Math.max(200, h - 8) });
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // Retry on mount — layout may not be settled immediately
    measure();
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 200);
    const t3 = setTimeout(measure, 500);
    const t4 = setTimeout(measure, 1000);

    // Also listen for window load — catches cases where fonts/layout settle late
    window.addEventListener('load', measure);

    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      window.removeEventListener('load', measure);
    };
  }, []);

  // Main D3 render
  useEffect(() => {
    if (!matrix || !svgRef.current) return;
    if (viewMode === 'beta' && !betaMatrix) return;
    const liveMatrix = matrix;
    const displayedMatrix = (activeScenario !== 'LIVE' && scenarioMatrix) ? scenarioMatrix : liveMatrix;

    const { tickers, matrix: corrMat, pValues, nObs } = displayedMatrix;
    const betaMat = betaMatrix?.beta;
    const betaR   = betaMatrix?.r;
    const betaSig = betaMatrix?.sigmaRatio;
    const n = tickers.length;

    // Determine display order
    const order: number[] = clusterMode
      ? hierarchicalCluster(corrMat)
      : Array.from({ length: n }, (_, i) => i);

    const orderedTickers = order.map(i => tickers[i]);

    const { width, height } = dims;
    const MARGIN = computeMargin(n);
    const innerW = width  - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top  - MARGIN.bottom;

    // ── Optional portfolio width scaling ─────────────────────────────────────
    const baseWeights = orderedTickers.map(t => Math.max(0, portfolioWeights[t] ?? 0));
    const sumW = baseWeights.reduce((s, w) => s + w, 0);
    const avgW = sumW > 1e-12 ? sumW / n : 0;

    const rawFactors = (portfolioMode && sumW > 1e-12)
      ? baseWeights.map(w => {
        const rel = avgW > 1e-12 ? (w / avgW) : 1;
        return Math.max(0.35, Math.min(3.0, 0.55 + 0.9 * rel)); // bounded
      })
      : Array.from({ length: n }, () => 1);

    const sumF = rawFactors.reduce((s, v) => s + v, 0) || 1;
    const colW = rawFactors.map(f => (f / sumF) * innerW);
    const rowH = rawFactors.map(f => (f / sumF) * innerH);

    const colX: number[] = [];
    const rowY: number[] = [];
    for (let i = 0; i < n; i++) {
      colX[i] = (i === 0) ? 0 : colX[i - 1]! + colW[i - 1]!;
      rowY[i] = (i === 0) ? 0 : rowY[i - 1]! + rowH[i - 1]!;
    }

    const cellW0 = innerW / n;
    const cellH0 = innerH / n;

    // ── Build baseline lookup map ─────────────────────────────────────────────
    const baselineLookup = new Map<string, number>();
    if (baselineMatrix) {
      for (let ri = 0; ri < baselineMatrix.tickers.length; ri++) {
        for (let ci = 0; ci < baselineMatrix.tickers.length; ci++) {
          baselineLookup.set(
            `${baselineMatrix.tickers[ri]}_${baselineMatrix.tickers[ci]}`,
            baselineMatrix.matrix[ri]![ci]!
          );
        }
      }
    }

    // ── Flash cell key set ────────────────────────────────────────────────────
    const flashKeySet = new Set<string>();
    flashAlerts.forEach(a => {
      flashKeySet.add(a.key);
      flashKeySet.add(`${a.col}_${a.row}`);  // mirror
    });

    const svg = d3.select(svgRef.current);
    svg
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label',
        `Correlation matrix — ${n}×${n} instruments, ${matrix.method} method, ${matrix.lookback} lookback`);

    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Column headers ────────────────────────────────────────────────────────
    g.selectAll('.col-label')
      .data(orderedTickers)
      .join('text')
      .attr('class', 'col-label heatmap-label')
      .attr('x', (_, i) => colX[i]! + colW[i]! / 2)
      .attr('y', -8)
      .attr('text-anchor', 'start')
      .attr('transform', (_, i) => `rotate(-45, ${colX[i]! + colW[i]! / 2}, -8)`)
      .attr('dx', '0.3em')
      .attr('dy', '0.3em')
      .attr('fill', '#888888')
      .attr('font-family', 'Syne, sans-serif')
      .attr('font-size', Math.max(8, Math.min(11, (portfolioMode ? cellW0 : colW[0]!) * 0.45)))
      .text(t => t);

    // ── Row headers ───────────────────────────────────────────────────────────
    g.selectAll('.row-label')
      .data(orderedTickers)
      .join('text')
      .attr('class', 'row-label heatmap-label')
      .attr('x', -10)
      .attr('y', (_, i) => rowY[i]! + rowH[i]! / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#888888')
      .attr('font-family', 'Syne, sans-serif')
      .attr('font-size', Math.max(8, Math.min(11, (portfolioMode ? cellH0 : rowH[0]!) * 0.45)))
      .text(t => t);

    // ── Cells ─────────────────────────────────────────────────────────────────
    type CellDatum = { ri: number; ci: number; row: string; col: string; r: number; pVal: number };
    const cellData: CellDatum[] = [];
    for (let ri = 0; ri < n; ri++) {
      for (let ci = 0; ci < n; ci++) {
        const origRow = order[ri]!;
        const origCol = order[ci]!;
        cellData.push({
          ri, ci,
          row: tickers[origRow]!,
          col: tickers[origCol]!,
          r: (viewMode === 'beta' ? (betaR?.[origRow]?.[origCol] ?? 0) : corrMat[origRow]![origCol]!)!,
          pVal: pValues[origRow]![origCol]!,
        });
      }
    }

    const first = isFirst.current;

    const GAP = 0;  // No gap between cells for a tight, appealing matrix

    const cells = g.selectAll<SVGRectElement, CellDatum>('.cell')
      .data(cellData, d => `${d.row}_${d.col}`)
      .join(
        enter => enter.append('rect')
          .attr('class', 'cell')
          .attr('x', d => colX[d.ci]! + GAP)
          .attr('y', d => rowY[d.ri]! + GAP)
          .attr('width',  d => colW[d.ci]! - GAP * 2)
          .attr('height', d => rowH[d.ri]! - GAP * 2)
          .attr('rx', 0)
          .attr('stroke', 'rgba(30,35,48,0.6)')
          .attr('stroke-width', 0.5)
          .attr('fill', '#1a1e28')
          .attr('opacity', first ? 0 : 1),
        update => update,
      );

    cells.attr('aria-label', (d: CellDatum) => {
      if (d.row === d.col) return `${INSTRUMENT_MAP.get(d.row)?.name ?? d.row} — diagonal`;
      const n1   = INSTRUMENT_MAP.get(d.row)?.name ?? d.row;
      const n2   = INSTRUMENT_MAP.get(d.col)?.name ?? d.col;
      const sign = d.r >= 0 ? '+' : '';
      const sig  = d.pVal < 0.05 ? ', statistically significant' : ', not significant';
      return `${n1} vs ${n2}: r = ${sign}${d.r.toFixed(2)}${sig}`;
    });

    cells.transition()
      .duration(first ? 0 : 400)
      .delay((d: CellDatum) => first ? d.ri * 40 : 0)
      .attr('fill', (d: CellDatum) => {
        if (d.row === d.col) return '#222838';
        const dimmed = Math.abs(d.r) < threshold;
        if (viewMode === 'beta') {
          const oi = tickers.indexOf(d.row);
          const oj = tickers.indexOf(d.col);
          const b = (oi !== -1 && oj !== -1) ? (betaMat?.[oi]?.[oj] ?? 1) : 1;
          const color = betaColor(b);
          return dimmed ? (d3.color(color)?.copy({ opacity: 0.18 })?.formatHex() ?? color) : color;
        }
        const color  = corrColor(d.r);
        return dimmed ? (d3.color(color)?.copy({ opacity: 0.18 })?.formatHex() ?? color) : color;
      })
      .attr('opacity', d => d.row === d.col ? 0.6 : 1);

    isFirst.current = false;

    // ── Cell text ─────────────────────────────────────────────────────────────
    type CellDatumText = typeof cellData[0];
    g.selectAll<SVGTextElement, CellDatumText>('.cell-text')
      .data(cellData)
      .join('text')
      .attr('class', 'cell-text')
      .attr('x', d => colX[d.ci]! + colW[d.ci]! / 2)
      .attr('y', d => rowY[d.ri]! + rowH[d.ri]! / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', d => d.row === d.col ? Math.max(10, Math.min(14, cellW0 * 0.35)) : Math.max(6, Math.min(11, Math.min(cellW0, cellH0) * 0.32)))
      .attr('font-weight', '700')
      .attr('fill', d => {
        if (d.row === d.col) return '#666';
        const dimmed = Math.abs(d.r) < threshold;
        return dimmed ? '#555' : (Math.abs(d.r) > 0.65 ? '#e8e3d5' : '#aaa');
      })
      .attr('pointer-events', 'none')
      .text(d => {
        if (d.row === d.col) return viewMode === 'beta' ? '1.00' : '—';
        if (viewMode === 'beta') {
          const oi = tickers.indexOf(d.row);
          const oj = tickers.indexOf(d.col);
          const b = (oi !== -1 && oj !== -1) ? (betaMat?.[oi]?.[oj] ?? 0) : 0;
          return b.toFixed(2);
        }
        return Math.round(d.r * 100).toString();
      });

    // ── Selected pair highlight ───────────────────────────────────────────────
    if (selectedPair) {
      const { row, col } = selectedPair;
      cellData
        .filter(d => (d.row === row && d.col === col) || (d.row === col && d.col === row))
        .forEach(d => {
          g.append('rect')
            .attr('x', colX[d.ci]!)
            .attr('y', rowY[d.ri]!)
            .attr('width', colW[d.ci]!)
            .attr('height', rowH[d.ri]!)
            .attr('rx', 2)
            .attr('fill', 'none')
            .attr('stroke', '#5a8a00')
            .attr('stroke-width', 2)
            .attr('pointer-events', 'none');
        });
    }

    // ── Asset-class group dividers (natural order only) ───────────────────────
    if (!clusterMode) {
      let prevClass = INSTRUMENT_MAP.get(orderedTickers[0]!)?.assetClass;
      for (let i = 1; i < n; i++) {
        const curClass = INSTRUMENT_MAP.get(orderedTickers[i]!)?.assetClass;
        if (curClass !== prevClass) {
          // Horizontal line
          g.append('line')
            .attr('x1', 0).attr('y1', rowY[i]!)
            .attr('x2', innerW).attr('y2', rowY[i]!)
            .attr('stroke', 'rgba(0,0,0,0.18)')
            .attr('stroke-width', 1.5)
            .attr('pointer-events', 'none');
          // Vertical line
          g.append('line')
            .attr('x1', colX[i]!).attr('y1', 0)
            .attr('x2', colX[i]!).attr('y2', innerH)
            .attr('stroke', 'rgba(0,0,0,0.18)')
            .attr('stroke-width', 1.5)
            .attr('pointer-events', 'none');
          prevClass = curClass;
        }
      }
    }

    // ── Cluster boundaries ────────────────────────────────────────────────────
    if (clusterMode) {
      const CORR_THRESHOLD = 0.35;
      for (let i = 1; i < n; i++) {
        const prev = order[i - 1]!;
        const curr = order[i]!;
        if (Math.abs(corrMat[prev]![curr]!) < CORR_THRESHOLD) {
          g.append('line')
            .attr('x1', 0).attr('y1', rowY[i]!)
            .attr('x2', innerW).attr('y2', rowY[i]!)
            .attr('stroke', 'rgba(90,138,0,0.3)').attr('stroke-width', 1.5);
          g.append('line')
            .attr('x1', colX[i]!).attr('y1', 0)
            .attr('x2', colX[i]!).attr('y2', innerH)
            .attr('stroke', 'rgba(90,138,0,0.3)').attr('stroke-width', 1.5);
        }
      }
    }

    // ── Anomaly pulse rings ───────────────────────────────────────────────────
    if (anomalyMode) {
      cellData.forEach(d => {
        if (d.row === d.col) return;
        const baseR = baselineLookup.get(`${d.row}_${d.col}`);
        if (baseR === undefined) return;
        if (Math.abs(d.r - baseR) > 0.25) {
          g.append('rect')
            .attr('class', 'anomaly-cell')
            .attr('x', colX[d.ci]! + 1)
            .attr('y', rowY[d.ri]! + 1)
            .attr('width',  colW[d.ci]! - 2)
            .attr('height', rowH[d.ri]! - 2)
            .attr('rx', 2)
            .attr('fill', 'none')
            .attr('stroke', '#b45309')
            .attr('stroke-width', 2)
            .attr('pointer-events', 'none');
        }
      });
    }

    // ── Flash cell overlays ───────────────────────────────────────────────────
    if (flashKeySet.size > 0) {
      cellData.forEach(d => {
        if (d.row === d.col) return;
        if (flashKeySet.has(`${d.row}_${d.col}`)) {
          g.append('rect')
            .attr('class', 'flash-cell')
            .attr('x', colX[d.ci]!)
            .attr('y', rowY[d.ri]!)
            .attr('width',  colW[d.ci]!)
            .attr('height', rowH[d.ri]!)
            .attr('rx', 2)
            .attr('fill', 'rgba(180, 83, 9, 0.38)')
            .attr('pointer-events', 'none');
        }
      });
    }

    // ── Scenario Δr overlay (scenario vs live) ────────────────────────────────
    if (activeScenario !== 'LIVE' && scenarioMatrix) {
      const liveLookup = new Map<string, number>();
      for (let ri = 0; ri < liveMatrix.tickers.length; ri++) {
        for (let ci = 0; ci < liveMatrix.tickers.length; ci++) {
          liveLookup.set(`${liveMatrix.tickers[ri]}_${liveMatrix.tickers[ci]}`, liveMatrix.matrix[ri]![ci]!);
        }
      }
      cellData.forEach(d => {
        if (d.row === d.col) return;
        const liveR = liveLookup.get(`${d.row}_${d.col}`);
        if (liveR === undefined) return;
        const delta = d.r - liveR;
        if (Math.abs(delta) < 0.08) return;
        const sym = delta > 0 ? '↑' : '↓';
        g.append('text')
          .attr('x', colX[d.ci]! + colW[d.ci]! - 6)
          .attr('y', rowY[d.ri]! + 7)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'central')
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('font-size', 9)
          .attr('fill', delta > 0 ? '#5a8a00' : '#cc2200')
          .attr('pointer-events', 'none')
          .text(`${sym}${Math.abs(delta).toFixed(2)}`);
      });
    }

    // ── Causality arrow overlays ──────────────────────────────────────────────
    if (causalityMode && causalityStatus === 'ready' && causalityMatrix) {
      cellData.forEach(d => {
        if (d.row === d.col) return;
        const yx = causalityMatrix[`${d.row}_${d.col}`] as { pValue?: number; fStat?: number; lags?: number } | undefined;
        const xy = causalityMatrix[`${d.col}_${d.row}`] as { pValue?: number; fStat?: number; lags?: number } | undefined;
        const sigYX = ((yx?.pValue) ?? 1) < 0.05;
        const sigXY = ((xy?.pValue) ?? 1) < 0.05;
        if (!sigYX && !sigXY) return;
        const symbol = sigYX && sigXY ? '↔' : sigYX ? '→' : '←';

        const bx = colX[d.ci]! + colW[d.ci]! - 22;
        const by = rowY[d.ri]! + 4;
        g.append('rect')
          .attr('x', bx)
          .attr('y', by)
          .attr('width', 18)
          .attr('height', 14)
          .attr('rx', 3)
          .attr('fill', 'rgba(0,0,0,0.35)')
          .attr('pointer-events', 'none');
        g.append('text')
          .attr('x', bx + 9)
          .attr('y', by + 7)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('font-size', 10)
          .attr('fill', '#ffffff')
          .attr('pointer-events', 'none')
          .text(symbol);
      });
    }

    // ── Interaction overlay (crosshair + tooltip) ─────────────────────────────
    const overlay = g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'crosshair');

    function idxFromPos(pos: number, starts: number[], sizes: number[]): number {
      // linear scan is fine for N<=25
      for (let i = 0; i < starts.length; i++) {
        const s = starts[i]!;
        const e = s + (sizes[i] ?? 0);
        if (pos >= s && pos < e) return i;
      }
      return -1;
    }

    overlay.on('mousemove', function (event: MouseEvent) {
      const [mx, my] = d3.pointer(event, g.node()!);
      const ci = idxFromPos(mx, colX, colW);
      const ri = idxFromPos(my, rowY, rowH);
      if (ci < 0 || ci >= n || ri < 0 || ri >= n) {
        // Restore opacity
        g.selectAll<SVGRectElement, CellDatum>('.cell').attr('opacity', 1);
        g.selectAll<SVGTextElement, CellDatumText>('.cell-text').attr('opacity', 1);
        setTooltip(t => ({ ...t, visible: false }));
        return;
      }

      // ── Crosshair dim ──────────────────────────────────────────────────────
      g.selectAll<SVGRectElement, CellDatum>('.cell')
        .attr('opacity', d => (d.ri === ri || d.ci === ci) ? 1 : 0.2);
      g.selectAll<SVGTextElement, CellDatumText>('.cell-text')
        .attr('opacity', d => (d.ri === ri || d.ci === ci) ? 1 : 0.2);

      const origRow = order[ri]!;
      const origCol = order[ci]!;
      const row     = tickers[origRow]!;
      const col     = tickers[origCol]!;
      const r       = viewMode === 'beta' ? (betaR?.[origRow]?.[origCol] ?? 0) : corrMat[origRow]![origCol]!;
      const baseR   = baselineLookup.get(`${row}_${col}`) ?? r;
      const beta    = viewMode === 'beta' ? (betaMat?.[origRow]?.[origCol] ?? 1) : 1;
      const sigmaRatio = viewMode === 'beta' ? (betaSig?.[origRow]?.[origCol] ?? 1) : 1;
      const svgRect = svgRef.current!.getBoundingClientRect();

      // Scenario tooltip augmentation: show live vs scenario and Δ
      let scenarioLine = '';
      if (activeScenario !== 'LIVE' && scenarioMatrix && viewMode === 'corr') {
        const li = liveMatrix.tickers.indexOf(row);
        const lj = liveMatrix.tickers.indexOf(col);
        if (li !== -1 && lj !== -1) {
          const liveR = liveMatrix.matrix[li]![lj]!;
          const delta = r - liveR;
          scenarioLine = `Scenario r=${r >= 0 ? '+' : ''}${r.toFixed(2)} vs Live r=${liveR >= 0 ? '+' : ''}${liveR.toFixed(2)} (Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`;
        }
      }

      let causalityText = '';
      if (causalityMode && causalityStatus === 'ready' && causalityMatrix && row !== col) {
        const yx = causalityMatrix[`${row}_${col}`] as { pValue?: number; fStat?: number; lags?: number } | undefined;
        const xy = causalityMatrix[`${col}_${row}`] as { pValue?: number; fStat?: number; lags?: number } | undefined;
        const sigYX = ((yx?.pValue) ?? 1) < 0.05;
        const sigXY = ((xy?.pValue) ?? 1) < 0.05;
        if (sigYX && sigXY) {
          causalityText = `Bidirectional Granger causality (p<0.05, lags=${yx?.lags ?? 5})`;
        } else if (sigYX && yx) {
          causalityText = `${col} Granger-causes ${row} (F=${(yx.fStat ?? 0).toFixed(2)}, p=${(yx.pValue ?? 0).toFixed(3)}, ${yx.lags ?? 5} lags)`;
        } else if (sigXY && xy) {
          causalityText = `${row} Granger-causes ${col} (F=${(xy.fStat ?? 0).toFixed(2)}, p=${(xy.pValue ?? 0).toFixed(3)}, ${xy.lags ?? 5} lags)`;
        } else {
          causalityText = `No significant Granger causality (α=0.05, lags=${yx?.lags ?? 5})`;
        }
      }

      setTooltip({
        visible: true,
        x: event.clientX - svgRect.left + 16,
        y: event.clientY - svgRect.top  - 10,
        row, col, r,
        beta,
        sigmaRatio,
        pValue: pValues[origRow]![origCol]!,
        nObs,
        trendDelta: r - baseR,
        viewMode,
        causalityText: [scenarioLine, causalityText].filter(Boolean).join(' · '),
      });
    });

    overlay.on('mouseleave', () => {
      g.selectAll('.cell').attr('opacity', 1);
      g.selectAll('.cell-text').attr('opacity', 1);
      setTooltip(t => ({ ...t, visible: false }));
    });

    overlay.on('click', function (event: MouseEvent) {
      const [mx, my] = d3.pointer(event, g.node()!);
      const ci = idxFromPos(mx, colX, colW);
      const ri = idxFromPos(my, rowY, rowH);
      if (ci < 0 || ci >= n || ri < 0 || ri >= n) return;
      const origRow = order[ri]!;
      const origCol = order[ci]!;
      if (origRow === origCol) return;
      selectPair(tickers[origRow]!, tickers[origCol]!);
    });

  }, [matrix, betaMatrix, viewMode, activeScenario, scenarioMatrix, baselineMatrix, portfolioMode, portfolioWeights, clusterMode, threshold, dims, selectedPair, selectPair, anomalyMode, flashAlerts, causalityMode, causalityMatrix, causalityStatus]);

  // ── Trend arrow helper ────────────────────────────────────────────────────
  function trendArrow(delta: number) {
    if (Math.abs(delta) < 0.03) return { symbol: '→', label: 'stable', cls: 'stable' };
    if (delta > 0) return { symbol: '↑', label: `+${delta.toFixed(2)} vs 1Y avg`, cls: 'up' };
    return { symbol: '↓', label: `${delta.toFixed(2)} vs 1Y avg`, cls: 'down' };
  }

  return (
    <div className="heatmap-wrapper" ref={wrapperRef}>
      <svg ref={svgRef} className="heatmap-svg" />

      {tooltip.visible && (
        <div
          className="heatmap-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="tooltip-pair">
            <span className="tooltip-ticker">{INSTRUMENT_MAP.get(tooltip.row)?.name ?? tooltip.row}</span>
            <span className="tooltip-vs"> vs </span>
            <span className="tooltip-ticker">{INSTRUMENT_MAP.get(tooltip.col)?.name ?? tooltip.col}</span>
          </div>
          {tooltip.row !== tooltip.col ? (
            <>
              {tooltip.viewMode === 'beta' ? (
                <>
                  <div className="tooltip-row">
                    <span className="tooltip-key">β (row | col)</span>
                    <span className="tooltip-val" style={{ color: tooltip.beta >= 1 ? '#1d4ed8' : '#cc2200' }}>
                      {tooltip.beta.toFixed(4)}
                    </span>
                  </div>
                  <div className="tooltip-row">
                    <span className="tooltip-key">Interpretation</span>
                    <span className="tooltip-val" style={{ color: '#444444' }}>
                      {INSTRUMENT_MAP.get(tooltip.row)?.ticker ?? tooltip.row} moves ~{tooltip.beta.toFixed(2)}x per 1% move in {INSTRUMENT_MAP.get(tooltip.col)?.ticker ?? tooltip.col}
                    </span>
                  </div>
                  <div className="tooltip-row">
                    <span className="tooltip-key">r</span>
                    <span className="tooltip-val" style={{ color: tooltip.r >= 0 ? '#5a8a00' : '#cc2200' }}>
                      {tooltip.r >= 0 ? '+' : ''}{tooltip.r.toFixed(4)}
                    </span>
                  </div>
                  <div className="tooltip-row">
                    <span className="tooltip-key">σ(row)/σ(col)</span>
                    <span className="tooltip-val">{tooltip.sigmaRatio.toFixed(4)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="tooltip-row">
                    <span className="tooltip-key">Correlation (r)</span>
                    <span
                      className="tooltip-val"
                      style={{ color: tooltip.r >= 0 ? '#5a8a00' : '#cc2200' }}
                    >
                      {tooltip.r >= 0 ? '+' : ''}{tooltip.r.toFixed(4)}
                    </span>
                  </div>
                  <div className="tooltip-row">
                    <span className="tooltip-key">vs 1Y avg</span>
                    {(() => {
                      const { symbol, label, cls } = trendArrow(tooltip.trendDelta);
                      return (
                        <span className={`tooltip-val tooltip-trend tooltip-trend--${cls}`}>
                          {symbol} {label}
                        </span>
                      );
                    })()}
                  </div>
                </>
              )}
              <div className="tooltip-row">
                <span className="tooltip-key">p-value</span>
                <span className={`tooltip-val ${tooltip.pValue < 0.05 ? 'sig' : 'insig'}`}>
                  {tooltip.pValue < 0.001 ? '<0.001' : tooltip.pValue.toFixed(3)}
                  {' '}{tooltip.pValue < 0.05 ? '★' : ''}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-key">Observations</span>
                <span className="tooltip-val">{tooltip.nObs}</span>
              </div>
              {causalityMode && tooltip.causalityText && (
                <div className="tooltip-row">
                  <span className="tooltip-key">Causality</span>
                  <span className="tooltip-val">{tooltip.causalityText}</span>
                </div>
              )}
            </>
          ) : (
            <div className="tooltip-row">
              <span className="tooltip-key">Diagonal — self</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
