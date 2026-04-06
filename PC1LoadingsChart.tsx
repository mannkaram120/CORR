import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface Props {
  data: Array<{ ticker: string; loading: number }>;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#0D1017',
  border: '1px solid #1E2330',
  borderRadius: 2,
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#E8E3D5',
};

export function PC1LoadingsChart({ data }: Props) {
  const top = [...data]
    .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
    .slice(0, 10);

  return (
    <div>
      <div style={{ fontSize: 9, color: '#555', letterSpacing: '1px', marginBottom: 6 }}>
        PC1 FACTOR LOADINGS
      </div>
      <div style={{ background: '#0A0C10', border: '1px solid #1E2330', borderRadius: 3, overflow: 'hidden' }}>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart
            data={top}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 4, left: 36 }}
          >
            <XAxis
              type="number"
              domain={[-1, 1]}
              tick={{ fontSize: 8, fill: '#555', fontFamily: "'JetBrains Mono', monospace" }}
              tickCount={5}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{ fontSize: 8, fill: '#888', fontFamily: "'JetBrains Mono', monospace" }}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [v.toFixed(3), 'Loading']}
            />
            <ReferenceLine x={0} stroke="#1E2330" strokeWidth={1} />
            <Bar dataKey="loading" radius={[0, 1, 1, 0]}>
              {top.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.loading >= 0 ? '#00D084' : '#FF3B30'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
