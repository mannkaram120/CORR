import type { ReportData } from './reportGenerator';
import { jsPDF } from 'jspdf';

export async function exportPDF(params: {
  report: ReportData;
  heatmapPngDataUrl: string;
}): Promise<void> {
  const { report, heatmapPngDataUrl } = params;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210;

  // Cover
  doc.setFillColor(10, 12, 16); doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(232, 227, 213); doc.setFontSize(32); doc.setFont('helvetica', 'bold');
  doc.text('KARAM.', 20, 40);
  doc.setFontSize(14); doc.setFont('helvetica', 'normal'); doc.setTextColor(136, 136, 136);
  doc.text('Cross-Asset Correlation Terminal — Research Report', 20, 52);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 20, 62);
  doc.text(`Method: ${report.method}  |  Lookback: ${report.lookback}  |  Instruments: ${report.nInstruments}`, 20, 70);

  // Heatmap
  doc.addPage();
  doc.setFillColor(10, 12, 16); doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(74, 158, 255); doc.setFontSize(10); doc.text('CORRELATION MATRIX', 10, 15);
  doc.addImage(heatmapPngDataUrl, 'PNG', 10, 20, W - 20, H - 30);

  // Stats page
  doc.addPage();
  doc.setFillColor(10, 12, 16); doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(74, 158, 255); doc.setFontSize(10); doc.text('MATRIX STATISTICS', 10, 15);
  doc.setTextColor(232, 227, 213); doc.setFontSize(9);
  doc.text(report.narrative, 10, 28, { maxWidth: W - 20 });

  const stats = [
    ['Avg |r|', report.avgAbsCorr.toFixed(3)],
    ['Max r', `${report.maxCorr.tickers.join(' / ')}: +${report.maxCorr.r.toFixed(3)}`],
    ['Min r', `${report.minCorr.tickers.join(' / ')}: ${report.minCorr.r.toFixed(3)}`],
    ['Sig pairs', `${report.sigPairsPct}%`],
    ['Total pairs', String(report.nPairs)],
  ];
  if (report.pca) {
    stats.push(['AR1', `${(report.pca.absorptionRatios.ar1 * 100).toFixed(1)}%`]);
    stats.push(['AR1 percentile', `${report.pca.ar1Percentile}th`]);
  }

  let y = 55;
  for (const [k, v] of stats) {
    doc.setTextColor(85, 85, 85); doc.text(k!, 10, y);
    doc.setTextColor(232, 227, 213); doc.text(v!, 80, y);
    y += 8;
  }

  if (report.anomalies.length > 0) {
    y += 6;
    doc.setTextColor(74, 158, 255); doc.text('ANOMALIES (Δr > 0.20 vs 1Y)', 10, y); y += 8;
    for (const a of report.anomalies) {
      doc.setTextColor(180, 83, 9);
      doc.text(`${a.tickers.join(' / ')}: ${a.delta >= 0 ? '+' : ''}${a.delta.toFixed(2)}`, 10, y); y += 7;
    }
  }

  doc.save(`nexus_report_${report.lookback}_${report.method}_${Date.now()}.pdf`);
}

function buildHTMLReport(report: ReportData, imgUrl: string): string {
  return `<!DOCTYPE html><html><head><title>NEXUS Report</title>
<style>body{background:#0A0C10;color:#E8E3D5;font-family:'JetBrains Mono',monospace;padding:20px}
h1{color:#4A9EFF;font-size:24px;margin-bottom:4px}
h2{color:#4A9EFF;font-size:14px;margin:20px 0 8px;border-bottom:1px solid #1E2330;padding-bottom:4px}
img{width:100%;border:1px solid #1E2330;border-radius:4px}
.stat{display:flex;gap:20px;padding:4px 0;border-bottom:1px solid #1E2330}
.k{color:#555;min-width:180px}.v{color:#E8E3D5}
p{color:#888;font-size:12px;line-height:1.6}</style></head><body>
<h1>NEXUS</h1><p>Cross-Asset Correlation Terminal — Research Report</p>
<p>Generated: ${new Date(report.generatedAt).toLocaleString()} · Method: ${report.method} · Lookback: ${report.lookback}</p>
<h2>CORRELATION MATRIX</h2><img src="${imgUrl}" alt="Heatmap"/>
<h2>SUMMARY</h2><p>${report.narrative}</p>
<div class="stat"><span class="k">Avg |r|</span><span class="v">${report.avgAbsCorr.toFixed(3)}</span></div>
<div class="stat"><span class="k">Max correlation</span><span class="v">${report.maxCorr.tickers.join(' / ')}: +${report.maxCorr.r.toFixed(3)}</span></div>
<div class="stat"><span class="k">Min correlation</span><span class="v">${report.minCorr.tickers.join(' / ')}: ${report.minCorr.r.toFixed(3)}</span></div>
<div class="stat"><span class="k">Significant pairs</span><span class="v">${report.sigPairsPct}%</span></div>
${report.pca ? `<div class="stat"><span class="k">AR1 absorption</span><span class="v">${(report.pca.absorptionRatios.ar1*100).toFixed(1)}% (${report.pca.ar1Percentile}th pct)</span></div>` : ''}
</body></html>`;
}
