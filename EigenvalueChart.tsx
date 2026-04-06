import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  eigenvalues: number[];
}

const TOOLTIP_STYLE = {
  backgroundColor: '#0D1017',
  border: '1px solid #1E2330',
  borderRadius: 2,
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#E8E3D5',
};

export function EigenvalueChart({ eigenvalues }: Props) {
  const sorted = [...eigenvalues]
    .filter(v => v > 0)
    .sort((a, b) => b - a)
    .slice(0, 10);

  const total = sorted.reduce((s, v) => s + v, 0) || 1;

  const data = sorted.map((v, i) => ({
    name: `PC${i + 1}`,
    pct: +(v / total * 100).toFixed(1),
    raw: +v.toFixed(3),
  }));

  return (
    <div>
      <div style={{ fontSize: 9, color: '#555', letterSpacing: '1px', marginBottom: 6 }}>
        EIGENVALUE SPECTRUM
      </div>
      <div style={{ background: '#0A0C10', border: '1px solid #1E2330', borderRadius: 3, overflow: 'hidden' }}>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 20 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 8, fill: '#555', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <YAxis
              tick={{ fontSize: 8, fill: '#555', fontFamily: "'JetBrains Mono', monospace" }}
              tickFormatter={v => `${v}%`}
              width={28}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v}%`, 'Variance explained']}
            />
            <Bar dataKey="pct" radius={[1, 1, 0, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === 0 ? '#4A9EFF' : i === 1 ? '#3A7ACC' : '#2A5499'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
