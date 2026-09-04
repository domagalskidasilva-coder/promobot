export function Sparkline({ values, up = false }) {
  if (!values || values.length < 2) return null
  const w = 110, h = 30
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / span) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  const color = up ? "#34d399" : "#f43f5e"
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"
                strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - ((values[values.length - 1] - min) / span) * (h - 4) - 2}
              r="2.4" fill={color} />
    </svg>
  )
}
