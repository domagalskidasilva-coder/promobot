// Gráficos SVG leves e acessíveis (sem dependência de chart lib).
// Todos têm <title>, texto alternativo em tabela sr-only e estado vazio explícito.

function niceMax(values) {
  const m = Math.max(...values, 0)
  if (m <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(m))
  const n = m / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * pow
}

export function BarChart({ data, height = 180, label = "Gráfico de barras", formatValue }) {
  if (!data || data.length === 0) return null
  const W = 560
  const H = height
  const padL = 8
  const padB = 28
  const padT = 10
  const max = niceMax(data.map((d) => d.value))
  const n = data.length
  const slot = (W - padL * 2) / n
  const barW = Math.min(44, Math.max(10, slot * 0.55))
  const fmt = formatValue || ((v) => String(v))
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <title>{label}</title>
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + (1 - f) * (H - padT - padB)
          return <line key={f} x1={padL} x2={W - padL} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
        })}
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (H - padT - padB))
          const x = padL + slot * i + (slot - barW) / 2
          const y = H - padB - h
          const fill = d.color || "#1d4ed8"
          return (
            <g key={`${d.label}-${i}`}>
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
              <rect x={x} y={y} width={barW} height={h} rx="4" fill={fill} />
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                {d.label.length > 10 ? `${d.label.slice(0, 10)}…` : d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="sr-only">
        {data.map((d) => `${d.label}: ${fmt(d.value)}`).join("; ")}
      </figcaption>
    </figure>
  )
}

export function HBarList({ rows, formatValue }) {
  if (!rows || rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)
  const fmt = formatValue || ((v) => String(v))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[13px] text-slate-600" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color || "#1d4ed8" }}
            />
          </span>
          <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-900">
            {fmt(r.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PriceHistoryChart({ points, height = 220, label = "Histórico de preço" }) {
  if (!points || points.length < 2) return null
  const W = 640
  const H = height
  const pad = { l: 56, r: 12, t: 12, b: 28 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || Math.max(1, maxY * 0.05)
  const lo = minY - spanY * 0.08
  const hi = maxY + spanY * 0.08
  const X = (x) => pad.l + ((x - minX) / spanX) * (W - pad.l - pad.r)
  const Y = (y) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")
  const area = `${path} L${X(maxX).toFixed(1)},${H - pad.b} L${X(minX).toFixed(1)},${H - pad.b} Z`
  const ticks = [0, 0.5, 1].map((f) => lo + (hi - lo) * f)
  const first = new Date(minX).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const last = new Date(maxX).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <title>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Number(t).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
        <path d={area} fill="#dbeafe" opacity="0.7" />
        <path d={path} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 60
          ? points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="2.2" fill="#1e40af" />)
          : null}
        <text x={pad.l} y={H - 8} fontSize="10" fill="#64748b">
          {first}
        </text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="10" fill="#64748b">
          {last}
        </text>
      </svg>
      <figcaption className="sr-only">
        {points.length} leituras, de {Number(minY).toFixed(2)} a {Number(maxY).toFixed(2)} reais.
      </figcaption>
    </figure>
  )
}

export function MiniTrend({ values, width = 96, height = 28 }) {
  if (!values || values.length < 2) {
    return <span className="text-xs text-slate-400">sem histórico</span>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - 3 - ((v - min) / span) * (height - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const falling = values[values.length - 1] < values[0]
  const color = falling ? "#047857" : "#475569"
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendência de preço">
      <title>Tendência de preço</title>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function CycleBars({ cycles }) {
  if (!cycles || cycles.length === 0) return null
  const max = Math.max(...cycles.map((c) => c.collected), 1)
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5 overflow-x-auto pb-1" role="img" aria-label="Coletadas e novas por ciclo">
        {cycles.slice(-24).map((c, i) => (
          <div key={`${c.ts}-${i}`} className="flex w-8 shrink-0 flex-col items-center gap-1" title={`${c.ts} — ${c.collected} coletadas, ${c.new} novas`}>
            <div className="flex h-20 w-full items-end justify-center gap-0.5">
              <span
                className="w-3 rounded-t bg-blue-600/80"
                style={{ height: `${Math.max(4, (c.collected / max) * 100)}%` }}
              />
              <span
                className="w-3 rounded-t bg-emerald-600/80"
                style={{ height: `${Math.max(4, Math.min(100, (c.new / Math.max(1, max)) * 100 + 6))}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-400">{String(c.ts).slice(11, 13)}h</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded bg-blue-600/80" aria-hidden="true" /> Coletadas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded bg-emerald-600/80" aria-hidden="true" /> Novas
        </span>
      </div>
    </div>
  )
}
