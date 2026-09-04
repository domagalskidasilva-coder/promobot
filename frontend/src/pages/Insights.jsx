import { useEffect, useState } from "react"
import Chart from "react-apexcharts"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { TrendingDown, Sparkles, PieChart, BarChart3, LineChart, Loader2, ArrowUpRight } from "lucide-react"
import { api } from "../lib/api"
import { FadeIn, CountUp, SpotlightCard } from "../components/fx"

const MKT_COLORS = { "Mercado Livre": "#ffe600", "Amazon": "#ff9900", "Shopee": "#ee4d2d" }

function Donut({ data, title, colors }) {
  if (!data?.length) return null
  return (
    <SpotlightCard className="p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-white/90"><PieChart size={14} className="text-accent-soft" /> {title}</h3>
      <Chart type="donut" height={230}
        series={data.map((d) => d.value)}
        options={{
          labels: data.map((d) => d.label),
          colors: colors || ["#f43f5e", "#8b5cf6", "#34d399", "#fbbf24"],
          theme: { mode: "dark" },
          legend: { position: "bottom", fontSize: "12px" },
          stroke: { width: 2 },
          dataLabels: { enabled: false },
          plotOptions: { pie: { donut: { size: "68%" } } },
        }} />
    </SpotlightCard>
  )
}

export function InsightsPage() {
  const [d, setD] = useState(null)

  useEffect(() => { api.insights().then(setD).catch(() => {}) }, [])
  if (!d) return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>

  return (
    <div className="space-y-5">
      <FadeIn>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="text-accent-soft" size={20} /> Insights</h1>
        <p className="text-sm text-mut">O que o bot aprendeu varrendo os marketplaces — atualiza a cada ciclo de coleta.</p>
      </FadeIn>

      {/* linha 1: distribuições */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.05}><Donut title="Ofertas por marketplace" data={d.by_market} colors={["#ffe600", "#ff9900", "#ee4d2d"]} /></FadeIn>
        <FadeIn delay={0.1}><Donut title="Por categoria" data={d.by_category} /></FadeIn>
        <FadeIn delay={0.15}>
          <SpotlightCard className="p-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-white/90"><BarChart3 size={14} className="text-accent-soft" /> Score da IA (0–100)</h3>
            {d.score_hist.length > 0 ? (
              <Chart type="bar" height={230}
                series={[{ name: "ofertas", data: d.score_hist.map((s) => s.n) }]}
                options={{
                  theme: { mode: "dark" },
                  colors: d.score_hist.map((s) => s.bucket >= 80 ? "#34d399" : s.bucket >= 60 ? "#fbbf24" : s.bucket >= 40 ? "#f97316" : "#f43f5e"),
                  plotOptions: { bar: { distributed: true, borderRadius: 4, horizontal: false } },
                  xaxis: { categories: d.score_hist.map((s) => `${s.bucket}-${s.bucket + 9}`), labels: { style: { fontSize: "10px" } } },
                  grid: { borderColor: "rgba(255,255,255,.06)" },
                  dataLabels: { enabled: false },
                }} />
            ) : <p className="py-16 text-center text-sm text-mut">IA sem análises ainda</p>}
          </SpotlightCard>
        </FadeIn>
      </div>

      {/* linha 2: novos por dia + ticket médio */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.2} className="lg:col-span-2">
          <SpotlightCard className="p-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-white/90"><LineChart size={14} className="text-accent-soft" /> Novos produtos (últimos 7 dias)</h3>
            {d.novos_7d.length > 1 ? (
              <Chart type="area" height={230}
                series={[{ name: "novos", data: d.novos_7d.map((s) => ({ x: s.d, y: s.n })) }]}
                options={{
                  theme: { mode: "dark" }, colors: ["#8b5cf6"],
                  fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0 } },
                  stroke: { curve: "smooth", width: 2.5 }, dataLabels: { enabled: false },
                  xaxis: { type: "category" }, grid: { borderColor: "rgba(255,255,255,.06)" },
                }} />
            ) : <p className="py-16 text-center text-sm text-mut">Poucos dias de histórico — o gráfico cresce com os ciclos.</p>}
          </SpotlightCard>
        </FadeIn>
        <FadeIn delay={0.25}>
          <SpotlightCard className="p-4">
            <h3 className="mb-2 text-sm font-bold text-white/90">Ticket médio por categoria</h3>
            <div className="space-y-2.5">
              {d.avg_price_cat.map((c) => (
                <div key={c.label} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <span className="text-sm text-mut">{c.label}</span>
                  <b className="text-lg">R$ {Number(c.avg).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</b>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </FadeIn>
      </div>

      {/* linha 3: maiores quedas 48h + top descontos + ciclos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FadeIn delay={0.3}>
          <SpotlightCard className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-white/90"><TrendingDown size={14} className="text-good" /> Maiores quedas em 48h</h3>
            <div className="space-y-2">
              {d.drops_48h.map((x, i) => (
                <motion.div key={x.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}>
                  <Link to={`/produto/${x.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition hover:border-good/40">
                    <span className={`market mkt-${x.marketplace}`}>{x.market_label}</span>
                    <span className="line-clamp-1 flex-1 text-[13px] text-white/85">{x.title}</span>
                    <s className="text-[11px] text-mut">R$ {Number(x.was).toFixed(0)}</s>
                    <b className="text-sm">R$ {Number(x.price).toFixed(0)}</b>
                    <span className="badge badge-ok">−{x.drop_pct}%</span>
                  </Link>
                </motion.div>
              ))}
              {d.drops_48h.length === 0 && <p className="py-6 text-center text-sm text-mut">Nenhuma queda relevante nas últimas 48h.</p>}
            </div>
          </SpotlightCard>
        </FadeIn>
        <FadeIn delay={0.35}>
          <SpotlightCard className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-white/90"><Sparkles size={14} className="text-accent-soft" /> Top 10 descontos reais</h3>
            <div className="space-y-2">
              {d.top_discounts.map((x, i) => (
                <motion.div key={x.product.id + "-" + i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}>
                  <Link to={`/produto/${x.product.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition hover:border-accent/40">
                    <span className="font-mono text-[12px] text-mut">#{i + 1}</span>
                    <span className={`market mkt-${x.product.marketplace}`}>{x.market_label}</span>
                    <span className="line-clamp-1 flex-1 text-[13px] text-white/85">{x.product.title}</span>
                    <b className="text-sm">R$ {Number(x.price).toFixed(0)}</b>
                    {x.real_discount_pct > 0 && <span className="badge badge-ok">−{Math.round(x.real_discount_pct)}%</span>}
                  </Link>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>
        </FadeIn>
      </div>

      <FadeIn delay={0.4}>
        <SpotlightCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-white/90">Histórico dos últimos ciclos</h3>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
            {d.cycles.map((c, i) => (
              <div key={i} className="group flex w-14 shrink-0 flex-col items-center gap-1"
                   title={`${c.ts.slice(0, 16).replace("T", " ")} — coletadas: ${c.collected}, novas: ${c.new}`}>
                <div className="flex h-24 w-full items-end justify-center gap-0.5">
                  <motion.div initial={{ height: 0 }} animate={{ height: `${Math.min(c.collected / 15, 100)}%` }}
                              transition={{ delay: i * 0.03, duration: 0.5 }}
                              className="w-3 rounded-t bg-accent/70" />
                  <motion.div initial={{ height: 0 }} animate={{ height: `${Math.min(c.new * 8 + 4, 100)}%` }}
                              transition={{ delay: i * 0.03 + 0.1, duration: 0.5 }}
                              className="w-3 rounded-t bg-good/80" />
                </div>
                <span className="text-[9px] text-mut">{c.ts.slice(11, 13)}h</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-mut">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-accent/70" /> coletadas</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-good/80" /> novas</span>
          </div>
        </SpotlightCard>
      </FadeIn>
    </div>
  )
}
