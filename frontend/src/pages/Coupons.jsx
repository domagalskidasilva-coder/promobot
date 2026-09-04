import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Ticket, Copy, Check, ExternalLink, Loader2 } from "lucide-react"
import { api } from "../lib/api"
import { timeago } from "../lib/format"
import { EmptyState, LoadingState, Page, PageHeader } from "../components/ui"

const MKT_COLORS = { ml: "#ffe600", amazon: "#ff9900", shopee: "#ee4d2d" }

function CouponCard({ c, i }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!c.code) return
    try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <motion.div layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.4) }}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      {/* recorte de cupom */}
      <div className="absolute left-0 top-0 h-full w-3 border-r border-dashed border-slate-200" />
      <div className="py-4 pl-7 pr-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <MarketBadge marketplace={c.marketplace} />
            <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-white/85">{c.description}</p>
            {c.store && <small className="text-[11px] text-slate-500">loja: {c.store}</small>}
          </div>
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener" className="btn btn-ghost btn-sm shrink-0">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {c.code ? (
            <>
              <code className="flex-1 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 font-mono text-[14px] font-bold tracking-wider text-brand-800">
                {c.code}
              </code>
              <button onClick={copy} className={`btn btn-sm ${copied ? "btn-ok" : ""}`}>
                {copied ? <><Check size={13} /> copiado</> : <><Copy size={13} /> copiar</>}
              </button>
            </>
          ) : (
            <span className="badge badge-good">aplicado automaticamente no link</span>
          )}
        </div>
        <small className="mt-2 block text-[11px] text-slate-500">visto {timeago(c.last_seen)}</small>
      </div>
    </motion.div>
  )
}

export function CouponsPage() {
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState("")

  useEffect(() => { api.coupons().then(setItems).catch(() => setItems([])) }, [])
  if (items === null) return <LoadingState />

  const filtered = filter ? items.filter((c) => c.marketplace === filter) : items

  return (
    <Page>
      <PageHeader
        title="Cupons de desconto"
        description="Detectados pelo bot nas ofertas dos marketplaces — o desconto é aplicado no checkout do site."
      />

      <div className="flex flex-wrap gap-2">
        {[["", "Todos"], ["ml", "Mercado Livre"], ["amazon", "Amazon"], ["shopee", "Shopee"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
                  className={`btn btn-sm ${filter === id ? "" : "btn-ghost"}`}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="Nenhum cupom encontrado ainda — a caça roda a cada 2 horas junto com os ciclos de coleta." />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filtered.map((c, i) => <CouponCard key={c.id} c={c} i={i} />)}
          </AnimatePresence>
        </div>
      )}
    </Page>
  )
}
