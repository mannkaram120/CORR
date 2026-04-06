import type { BetaMatrix, CorrelationMatrix, MatrixViewMode, PCAResult, PortfolioMetrics, PortfolioWeights, ScenarioId } from '../types';
import { buildReportData, snapshotFromStore } from '../lib/reportGenerator';
import { exportPDF as exportPDFImpl } from '../lib/pdfExport';

/** Export the heatmap SVG as a PNG with timestamp watermark */
export async function exportPNG(
  svgEl: SVGSVGElement,
  params: { viewMode: MatrixViewMode; corrMatrix: CorrelationMatrix; betaMatrix: BetaMatrix | null }
): Promise<void> {
  const { viewMode, corrMatrix, betaMatrix } = params;
  const stampMatrix = viewMode === 'beta' && betaMatrix ? betaMatrix : corrMatrix;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  const scale = 2; // Retina
  canvas.width  = svgEl.clientWidth  * scale;
  canvas.height = svgEl.clientHeight * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#0A0C10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  // Timestamp watermark
  const ts = stampMatrix.timestamp.toISOString().replace('T', ' ').slice(0, 19);
  ctx.font = `12px 'JetBrains Mono', monospace`;
  ctx.fillStyle = '#3A4050';
  ctx.textAlign = 'right';
  const modeLabel = viewMode === 'beta' ? 'BETA MODE' : 'CORR MODE';
  ctx.fillText(`KARAM  ${modeLabel}  ${stampMatrix.method}  ${stampMatrix.lookback}  ${ts} UTC`, canvas.width / scale - 12, canvas.height / scale - 10);

  URL.revokeObjectURL(url);

  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `karam_${viewMode === 'beta' ? 'beta' : 'corr'}_${ts.replace(/[: ]/g, '-')}.png`;
    a.click();
  }, 'image/png');
}

/** Export active matrix view as CSV */
export function exportCSV(params: {
  viewMode: MatrixViewMode;
  corrMatrix: CorrelationMatrix;
  betaMatrix: BetaMatrix | null;
  portfolio?: { enabled: boolean; weights: PortfolioWeights; metrics: PortfolioMetrics | null };
}): void {
  const { viewMode, corrMatrix, betaMatrix, portfolio } = params;
  const tickers = corrMatrix.tickers;
  const mat = viewMode === 'beta' ? (betaMatrix?.beta ?? corrMatrix.matrix) : corrMatrix.matrix;

  const includePortfolio = Boolean(portfolio?.enabled);
  const header = [
    '',
    ...tickers,
    ...(includePortfolio ? ['weight', 'marginal_diversification'] : []),
  ].join(',');

  const mdLookup = new Map<string, number>();
  if (includePortfolio && portfolio?.metrics) {
    portfolio.metrics.marginalDiversification.forEach(x => mdLookup.set(x.ticker, x.md));
  }

  const rows = mat.map((row, i) => {
    const t = tickers[i]!;
    const base = [t, ...row.map(r => r.toFixed(4))];
    if (!includePortfolio) return base.join(',');
    const w = (portfolio?.weights?.[t] ?? 0);
    const md = mdLookup.get(t) ?? 0;
    return [...base, w.toFixed(6), md.toFixed(6)].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const ts = (viewMode === 'beta' && betaMatrix ? betaMatrix.timestamp : corrMatrix.timestamp)
    .toISOString().slice(0, 19).replace(/[: ]/g, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `karam_${viewMode === 'beta' ? 'beta' : 'corr'}_${ts}.csv`;
  a.click();
}

async function captureSvgAsPngDataUrl(svgEl: SVGSVGElement, scale = 2): Promise<string> {
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = svgEl.clientWidth * scale;
  canvas.height = svgEl.clientHeight * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  return canvas.toDataURL('image/png');
}

export async function exportPDF(params: {
  svgEl: SVGSVGElement;
  corrMatrix: CorrelationMatrix;
  baselineMatrix: CorrelationMatrix | null;
  pcaResult: PCAResult | null;
  activeScenario: ScenarioId;
  portfolio?: { enabled: boolean; metrics: PortfolioMetrics | null };
}): Promise<void> {
  const { svgEl, corrMatrix, baselineMatrix, pcaResult, activeScenario, portfolio } = params;
  const heatmapPngDataUrl = await captureSvgAsPngDataUrl(svgEl, 3);

  const snap = snapshotFromStore({
    tickers: corrMatrix.tickers,
    corr: corrMatrix.matrix,
    pValues: corrMatrix.pValues,
    baselineCorr: baselineMatrix?.matrix,
    lookback: corrMatrix.lookback,
    method: corrMatrix.method,
    timestamp: corrMatrix.timestamp,
    pca: pcaResult,
    scenario: activeScenario,
    portfolioEnabled: Boolean(portfolio?.enabled),
    portfolioMetrics: portfolio?.metrics ?? null,
  });
  const report = buildReportData(snap);
  await exportPDFImpl({ report, heatmapPngDataUrl });
}
