import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import Chart from "react-apexcharts"
import { ArrowLeft, ExternalLink, Eye, Bot, Award, TrendingDown, Loader2 } from "lucide-react"
import { api } from "../lib/api"
import { FadeIn, SpotlightCard, ScorePill } from "../components/fx"
import { timeago } from "../App"

const PERIODS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "all", label: "tudo" },
]

export function ProductPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [period, setPeriod] = useState("all")
  const [target, setTarget] = useState("")

  const load = () => api.product(id, period).then((d) => { setData(d); setTarget(d.watched?.target_price ?? "") }).catch(() => {})
  useEffect(() => { setData(null); load() }, [id, period])

  if (!data) return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  const { product: p, offer: o, analysis: a, history, stats, watched } = data
  const points = history.map((h) => ({ x: new Date(h.t).getTime(), y: h.p }))

  const watch = async () => { await api.addWatch(p.id, target === "" ? null : parseFloat(target)); load() }

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-mut transition hover:text-white">
        <ArrowLeft size={15} /> voltar às ofertas
      </Link>

      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="max-w-3xl text-xl font-bold leading-snug">{p.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`market mkt-${p.marketplace}`}>{data.market_label}</span>
              <span className={`badge ${o.in_stock ? "badge-ok" : "badge-warn"}`}>{o.in_stock ? "em estoque" : "sem estoque"}</span>
              {p.category && <span className="badge">{p.category === "games" ? "jogos" : "eletrônicos"}</span>}
            </div>
          </div>
          {a?.score != null && <ScorePill score={a.score} />}
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-start gap-6">
        <FadeIn delay={0.05} className="w-full shrink-0 sm:w-[290px]">
          {p.image_url
            ? <img src={p.image_url} alt="" className="w-full rounded-2xl bg-white object-contain" />
            : <div className="grid h-56 w-full place-items-center rounded-2xl bg-ink-900 text-mut">sem imagem</div>}
        </FadeIn>

        <FadeIn delay={0.1} className="min-w-[240px] flex-1">
          <div className="text-4xl font-extrabold">R$ {Number(o.price).toFixed(2)}</div>
          {o.list_price > o.price && (
            <p className="mt-1 flex items-baseline gap-2">
              <s className="text-sm text-mut">R$ {Number(o.list_price).toFixed(2)}</s>
              {a?.real_discount_pct > 0 && <b className="text-good">−{Math.round(a.real_discount_pct)}%</b>}
            </p>
          )}
          <a href={p.url} target="_blank" rel="noopener" className="btn mt-3">
            <ExternalLink size={14} /> Ver oferta no site
          </a>

          {stats && stats.n_points > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["mínimo", stats.min], ["média", stats.avg], ["máximo", stats.max]].map(([label, v]) => (
                <div key={label} className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-2">
                  <b className="block text-sm">R$ {Number(v).toFixed(2)}</b>
                  <span className="text-[11px] text-mut">{label} no período</span>
                </div>
              ))}
              <div className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-2">
                <b className="block text-sm">{stats.n_points}</b>
                <span className="text-[11px] text-mut">leituras</span>
              </div>
            </div>
          )}
        </FadeIn>

        {a && (a.score != null || a.summary || (a.flags || []).length > 0) && (
          <FadeIn delay={0.15} className="w-full sm:w-[300px]">
            <SpotlightCard className="p-4" spotlightColor="rgba(139,92,246,.15)">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
                <Bot size={16} className="text-violet-glow" /> Análise da IA
              </h3>
              {a.score != null && (
                <div className={`mt-1 text-4xl font-extrabold ${a.score >= 80 ? "text-good" : a.score >= 60 ? "text-warn" : "text-accent-soft"}`}>
                  {a.score}<small className="text-base text-mut">/100</small>
                </div>
              )}
              {a.summary && <p className="mt-2 text-[13.5px] leading-relaxed">{a.summary}</p>}
              {(a.flags || []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {a.flags.map((f) => <li key={f} className="badge badge-warn">{f}</li>)}
                </ul>
              )}
              <div className="mt-2 space-y-0.5 text-[13px] text-mut">
                {a.is_hist_min && <p className="flex items-center gap-1 text-good"><Award size={13} /> menor preço já registrado</p>}
                {a.vs_avg30_pct != null && <p className="flex items-center gap-1"><TrendingDown size={13} /> {a.vs_avg30_pct.toFixed(1)}% vs média 30d</p>}
                {a.ai_analyzed_at && <p className="text-[11px]">analisado {timeago(a.ai_analyzed_at)}</p>}
              </div>
            </SpotlightCard>
          </FadeIn>
        )}
      </div>

      <FadeIn delay={0.2}>
        <h2 className="mb-2 text-lg font-bold">Histórico de preço</h2>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PERIODS.map((pd) => (
            <button key={pd.id} onClick={() => setPeriod(pd.id)}
                    className={`btn btn-sm ${period === pd.id ? "" : "btn-ghost"}`}>{pd.label}</button>
          ))}
        </div>
        {points.length >= 2 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-ink-700 bg-ink-850 p-3">
            <Chart
              type="area" height={260}
              series={[{ name: "Preço", data: points }]}
              options={{
                chart: { toolbar: { show: false }, zoom: { enabled: false }, background: "transparent" },
                theme: { mode: "dark" },
                colors: ["#f43f5e"],
                fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0 } },
                stroke: { curve: "smooth", width: 2.5 },
                dataLabels: { enabled: false },
                xaxis: { type: "datetime", labels: { datetimeUTC: false }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis: { labels: { formatter: (v) => "R$ " + v.toLocaleString("pt-BR") } },
                grid: { borderColor: "rgba(255,255,255,.06)" },
                tooltip: { x: { format: "dd/MM HH:mm" } },
              }}
            />
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-900/50 py-8 text-center text-sm text-mut">
            Histórico insuficiente — o gráfico aparece depois de mais ciclos.
          </div>
        )}
      </FadeIn>

      <FadeIn delay={0.25}>
        <h2 className="mb-2 flex items-center gap-1.5 text-lg font-bold"><Eye size={17} /> Watchlist</h2>
        <div className="flex flex-wrap items-center gap-2">
          {watched && <span className="badge badge-ok">monitorando</span>}
          <input className="field w-[220px]" type="number" step="0.01" min="0"
                 placeholder="Preço-alvo (R$) — opcional"
                 value={target} onChange={(e) => setTarget(e.currentTarget.value)} />
          <button className="btn" onClick={watch}>{watched ? "Atualizar alvo" : "Monitorar"}</button>
        </div>
      </FadeIn>
    </div>
  )
}
