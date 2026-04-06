import React, { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

/** Tiny inline SVG sparkline — no axes, no labels */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 60,
  height = 16,
  color = 'var(--green)',
  strokeWidth = 1.2,
}) => {
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 1;
    const w = width - pad * 2;
    const h = height - pad * 2;

    return data
      .map((v, i) => {
        const x = pad + (i / (data.length - 1)) * w;
        const y = pad + h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (data.length < 2) return null;

  // Determine trend color: compare last vs first
  const trend = data[data.length - 1]! - data[0]!;
  const lineColor = trend >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
};
