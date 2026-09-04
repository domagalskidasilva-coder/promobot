import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Link, useSearchParams } from "react-router-dom"
import {
  Search, Flame, TrendingDown, Award, Bot, Store, Gamepad2, Monitor,
  ArrowUpRight, ChevronLeft, ChevronRight, FilterX, Radar, Zap, Clock3,
} from "lucide-react"
import { api } from "../lib/api"
import { SpotlightCard, CountUp, FadeIn, ShinyText } from "../components/fx"
import { timeago } from "../App"

const SORTS = [
  { id: "hot", label: "Mais quentes" },
  { id: "recent", label: "Recentes" },
  { id: "discount", label: "Desconto real" },
  { id: "score", label: "Score IA" },
  { id: "price_asc", label: "Menor preço" },
  { id: "price_desc", label: "Maior preço" },
]

/* ---------------- Hero + Ticker ---------------- */
function Hero({ kpis }) {
  return (
    <FadeIn>
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.05] to-transparent p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-10 h-52 w-52 rounded-full bg-violet-glow/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-mut">
              <Radar size={13} className="text-accent-soft" /> radar de promoções · ml · amazon · shopee
            </div>
            <h1 className="mt-2 text-[40px] font-black leading-[1.05] tracking-tight">
              <ShinyText>Cash, é promoção de verdade.</ShinyText>
            </h1>
            <p className="mt-2 max-w-xl text-[15px] text-mut">
              Preços comparados com o <b className="text-white">histórico real</b> que o bot registrou —
              não com o “de/por” inflado dos anúncios. IA reprisa cada oferta antes de alertar.
            </p>
          </div>
          {kpis?.last_collect && (
            <div className="glass hidden rounded-2xl px-5 py-3.5 text-right lg:block">
              <div className="flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-wider text-mut">
                <Clock3 size={12} /> último ciclo
              </div>
              <div className="mt-0.5 text-lg font-extrabold">{timeago(kpis.last_collect.created_at)}</div>
              <div className="text-[11px] text-mut">{kpis.last_collect.message.slice(0, 60)}</div>
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  )
}

function Ticker({ items }) {
  if (!items?.length) return null
  const row = [...items, ...items] // loop contínuo
  return (
    <FadeIn delay={0.1}>
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] py-2.5">
        <div className="z-10 ml-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
          <Zap size={12} /> top descontos
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="animate-ticker flex w-max items-center gap-8 pl-4">
            {row.map((d, i) => (
              <Link key={i} to={`/produto/${d.product.id}`} className="group flex shrink-0 items-center gap-2 text-[13px]">
                <span className={`market mkt-${d.product.marketplace}`}>{d.product.marketplace}</span>
                <span className="max-w-[240px] truncate text-white/80 group-hover:text-white">{d.product.title}</span>
                <b className="font-mono text-[13px] text-white/70">R$ {Number(d.offer.price).toFixed(0)}</b>
                {d.analysis?.real_discount_pct > 0 && (
                  <span className="rounded-md bg-good/15 px-1.5 py-0.5 text-[11px] font-extrabold text-good">
                    −{Math.round(d.analysis.real_discount_pct)}%
                  </span>
                )}
                <span className="text-white/20">/</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </FadeIn>
  )
}

/* ---------------- Bento KPIs ---------------- */
function Kpis({ kpis }) {
  const mkt = Object.fromEntries((kpis.by_market || []).map((m) => [m.marketplace, m.n]))
  const cards = [
    { icon: Store, label: "produtos monitorados", value: kpis.total,
      foot: <span className="flex gap-2 text-[11px] text-mut">
        <span className="mkt-ml font-bold">ML {mkt.ml ?? 0}</span>
        <span className="mkt-amazon font-bold">AMZ {mkt.amazon ?? 0}</span>
        <span className="mkt-shopee font-bold">SHP {mkt.shopee ?? 0}</span>
      </span>, span: "lg:col-span-2" },
    { icon: Flame, label: "ofertas quentes agora", value: kpis.hot, hot: true,
      foot: "score alto · menor histórico · −25% vs média" },
    { icon: TrendingDown, label: "melhor desconto real", value: kpis.best_discount, pct: true, good: true,
      foot: "vs histórico próprio, não vs “de/por”" },
    { icon: Award, label: "menor preço histórico", value: kpis.hist_min, foot: "nunca vimos mais barato" },
    { icon: Bot, label: "score médio da IA", value: kpis.avg_score, foot: kpis.ai_pending ? `${kpis.ai_pending} na fila de análise` : "fila de IA vazia" },
  ]
  return (
    <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
      {cards.map((c, i) => (
        <FadeIn key={c.label} delay={i * 0.05} className={c.span ?? ""}>
          <SpotlightCard className={`h-full p-5 ${c.hot ? "!border-accent/35" : c.good ? "!border-good/30" : ""}`}>
            <div className="flex items-center gap-2 text-mut">
              <c.icon size={14} className={c.hot ? "text-accent-soft" : c.good ? "text-good" : ""} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{c.label}</span>
            </div>
            <div className={`mt-1.5 text-[38px] font-black leading-none tracking-tight ${c.hot ? "text-accent-soft" : c.good ? "text-good" : ""}`}>
              {c.pct
                ? <><span className="text-2xl align-top">−</span><CountUp value={c.value ?? 0} /><span className="text-2xl align-top">%</span></>
                : <CountUp value={c.value ?? 0} />}
            </div>
            <div className="mt-1.5 text-[12px] leading-snug text-mut/90">{c.foot}</div>
          </SpotlightCard>
        </FadeIn>
      ))}
    </section>
  )
}

/* ---------------- Card XL ---------------- */
function OfferCard({ d, rank }) {
  const o = d.offer, p = d.product, a = d.analysis
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.45, delay: Math.min(rank * 0.035, 0.45), ease: [0.22, 1, 0.36, 1] }}
    >
      <SpotlightCard className={`group h-full ${a?.is_hist_min ? "!border-warn/40" : ""}`}>
        <Link to={`/produto/${p.id}`} className="relative block overflow-hidden rounded-t-2xl">
          {p.image_url
            ? <img src={p.image_url} loading="lazy" alt=""
                   className="block h-52 w-full bg-white object-contain transition duration-500 group-hover:scale-[1.04]" />
            : <div className="grid h-52 w-full place-items-center bg-ink-900 text-mut"><Monitor size={30} /></div>}
          {rank != null && rank < 3 && (
            <span className="absolute left-3 top-3 rounded-lg bg-ink-950/80 px-2 py-0.5 font-mono text-[12px] font-bold text-warn backdrop-blur">
              #{rank + 1}
            </span>
          )}
          {a?.score != null && (
            <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold text-ink-950 shadow-float
              ${a.score >= 80 ? "bg-good" : a.score >= 60 ? "bg-warn" : "bg-accent"}`}>
              IA {a.score}
            </span>
          )}
          {a?.real_discount_pct > 0 && (
            <span className="absolute bottom-3 right-3 rounded-lg bg-good px-2 py-0.5 text-[13px] font-black text-ink-950 shadow-float">
              −{Math.round(a.real_discount_pct)}%
            </span>
          )}
        </Link>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-baseline gap-2">
            <span className={`market mkt-${p.marketplace}`}>{d.market_label}</span>
            {p.category && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-mut">
                {p.category === "games" ? <Gamepad2 size={11} /> : <Monitor size={11} />}
                {p.category === "games" ? "jogos" : "eletr."}
              </span>
            )}
            <span className="ml-auto text-[11px] text-mut">{timeago(o.updated_at)}</span>
          </div>
          <Link to={`/produto/${p.id}`}>
            <h3 className="line-clamp-2 min-h-[2.6em] text-[14.5px] font-semibold leading-snug text-white/90 transition group-hover:text-white">
              {p.title}
            </h3>
          </Link>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[22px] font-black tracking-tight">R$ {Number(o.price).toFixed(2)}</span>
            {o.list_price > o.price && <s className="text-xs text-mut">R$ {Number(o.list_price).toFixed(2)}</s>}
          </div>
          {a?.vs_avg30_pct > 0 && (
            <small className="inline-flex items-center gap-1 text-[11.5px] text-good">
              <TrendingDown size={11} /> {Math.round(a.vs_avg30_pct)}% vs média 30d
            </small>
          )}
          {a?.summary && <p className="line-clamp-2 text-xs leading-relaxed text-mut">{a.summary}</p>}
          {(a?.flags || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(a.flags || []).slice(0, 2).map((f) => <span key={f} className="badge badge-warn">{f}</span>)}
            </div>
          )}
          <Link to={`/produto/${p.id}`}
                className="mt-auto inline-flex items-center gap-1 pt-1 text-[12.5px] font-semibold text-mut transition hover:gap-2 hover:text-white">
            ver análise completa <ArrowUpRight size={13} />
          </Link>
        </div>
      </SpotlightCard>
    </motion.div>
  )
}

/* ---------------- Página ---------------- */
export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [kpis, setKpis] = useState(null)
  const [all, setAll] = useState({ items: [], total: 0, pages: 1, page: 1 })
  const [data, setData] = useState({ items: [], total: 0, pages: 1, page: 1 })
  const [loading, setLoading] = useState(true)
  const page = parseInt(searchParams.get("page") || "1", 10)
  const filters = {
    q: searchParams.get("q") || "",
    marketplace: searchParams.get("marketplace") || "",
    category: searchParams.get("category") || "",
    sort: searchParams.get("sort") || "hot",
    min_score: searchParams.get("min_score") || "",
    max_price: searchParams.get("max_price") || "",
    hot_only: searchParams.get("hot_only") === "true",
  }

  useEffect(() => { api.stats().then(setKpis).catch(() => {}) }, [])
  useEffect(() => {
    api.offers({ limit: 96, sort: "discount", page: 1 }).then(setAll).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api.offers({ ...filters, page, limit: 32 })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, pages: 1, page: 1 }))
      .finally(() => setLoading(false))
  }, [searchParams])

  const set = (k, v) => {
    const next = new URLSearchParams(searchParams)
    if (v === "" || v == null) next.delete(k)
    else next.set(k, v)
    next.delete("page")
    setSearchParams(next)
  }

  const hasFilters = ["q", "marketplace", "category", "min_score", "max_price"].some((k) => filters[k]) || filters.hot_only

  return (
    <div className="space-y-5">
      <Hero kpis={kpis} />
      <Ticker items={all.items.slice(0, 14)} />
      {kpis && <Kpis kpis={kpis} />}

      {/* toolbar */}
      <FadeIn delay={0.15}>
        <div className="sticky top-4 z-40 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-ink-950/80 p-3 backdrop-blur-xl">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mut" />
            <input
              className="field pl-10"
              placeholder="Buscar produto…"
              defaultValue={filters.q}
              onChange={(e) => {
                const v = e.currentTarget.value
                if (v === "") set("q", "")
              }}
              onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)}
            />
          </div>
          <select className="field w-auto" value={filters.marketplace} onChange={(e) => set("marketplace", e.target.value)}>
            <option value="">Todos os sites</option>
            <option value="ml">Mercado Livre</option>
            <option value="amazon">Amazon</option>
            <option value="shopee">Shopee</option>
          </select>
          <select className="field w-auto" value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Categorias</option>
            <option value="electronics">Eletrônicos</option>
            <option value="games">Jogos</option>
          </select>
          <select className="field w-auto" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input className="field w-[110px]" type="number" min="0" max="100" placeholder="Score IA"
                 defaultValue={filters.min_score}
                 onChange={(e) => e.currentTarget.value === "" && set("min_score", "")}
                 onKeyDown={(e) => e.key === "Enter" && set("min_score", e.currentTarget.value)} />
          <input className="field w-[140px]" type="number" min="0" step="0.01" placeholder="Preço máx. R$"
                 defaultValue={filters.max_price}
                 onChange={(e) => e.currentTarget.value === "" && set("max_price", "")}
                 onKeyDown={(e) => e.key === "Enter" && set("max_price", e.currentTarget.value)} />
          <button onClick={() => set("hot_only", !filters.hot_only)}
                  className={`btn btn-sm ${filters.hot_only ? "" : "btn-ghost"}`}>
            <Flame size={13} /> quentes
          </button>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>
              <FilterX size={13} /> limpar
            </button>
          )}
        </div>
      </FadeIn>

      <div className="flex items-center justify-between text-[13px] text-mut">
        <span><b className="text-white">{data.total}</b> ofertas{data.pages > 1 ? ` — página ${data.page} de ${data.pages}` : ""}</span>
        {loading && <span className="inline-flex items-center gap-1.5 text-accent-soft">filtrando…</span>}
      </div>

      {!loading && data.items.length === 0 && (
        <FadeIn>
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
            <Radar className="mx-auto mb-4 h-11 w-11 text-mut" />
            <h2 className="text-xl font-bold">Nada com esses filtros</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-mut">
              Limpe os filtros ou rode um ciclo de coleta — a busca por palavra-chave passa pelo Chrome real.
            </p>
            <button className="btn mx-auto mt-5" onClick={() => setSearchParams({})}>limpar filtros</button>
          </div>
        </FadeIn>
      )}

      <div className={`grid grid-cols-3 gap-4 transition-opacity duration-200 xl:grid-cols-4 ${loading ? "opacity-40" : ""}`}>
        {data.items.map((d, i) => <OfferCard key={`${d.product.id}-${filters.sort}-${i}`} d={d} rank={i} />)}
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-4 py-5">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1}
                  onClick={() => { const n = new URLSearchParams(searchParams); n.set("page", page - 1); setSearchParams(n) }}>
            <ChevronLeft size={14} /> anterior
          </button>
          <span className="text-sm text-mut">página {data.page} / {data.pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.pages}
                  onClick={() => { const n = new URLSearchParams(searchParams); n.set("page", page + 1); setSearchParams(n) }}>
            próxima <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
