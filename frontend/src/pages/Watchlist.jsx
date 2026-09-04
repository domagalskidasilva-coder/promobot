import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Eye, Target, Trash2, ArrowUpRight } from "lucide-react"
import { api } from "../lib/api"
import { FadeIn, SpotlightCard } from "../components/fx"
import { timeago } from "../App"

export function WatchlistPage() {
  const [items, setItems] = useState(null)

  const load = () => api.watchlist().then(setItems).catch(() => setItems([]))
  useEffect(() => { load() }, [])

  if (!items) return null

  return (
    <div className="space-y-4">
      <FadeIn>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Eye className="text-accent-soft" size={20} /> Watchlist</h1>
        <p className="text-sm text-mut">O bot avisa por e-mail quando o preço cai até o seu alvo.</p>
      </FadeIn>

      {items.length === 0 && (
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-900/50 py-14 text-center">
            <Target className="mx-auto mb-3 h-10 w-10 text-mut" />
            <h2 className="text-lg font-bold">Nada monitorado ainda</h2>
            <p className="mt-1 text-sm text-mut">Abra uma oferta e clique em “Monitorar”.</p>
            <Link to="/" className="btn mt-4">ver ofertas</Link>
          </div>
        </FadeIn>
      )}

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence>
          {items.map((it, i) => (
            <motion.div key={it.product.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.4) }}
            >
              <SpotlightCard className={`h-full ${it.hit ? "!border-good/50" : ""}`}>
                {it.hit && (
                  <div className="rounded-t-2xl bg-good py-0.5 text-center text-[11px] font-extrabold text-ink-950">
                    <Target size={11} className="mr-1 inline" /> atingiu o alvo
                  </div>
                )}
                <Link to={`/produto/${it.product.id}`}>
                  {it.product.image_url
                    ? <img src={it.product.image_url} loading="lazy" alt="" className="block h-40 w-full bg-white object-contain" />
                    : <div className="grid h-40 w-full place-items-center bg-ink-900 text-mut">sem imagem</div>}
                </Link>
                <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className={`market mkt-${it.product.marketplace}`}>{it.market_label}</span>
                    <span className="ml-auto text-[11px] text-mut">{timeago(it.offer.updated_at)}</span>
                  </div>
                  <Link to={`/produto/${it.product.id}`}>
                    <h3 className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-medium leading-snug">{it.product.title}</h3>
                  </Link>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xl font-extrabold">R$ {Number(it.offer.price).toFixed(2)}</span>
                    {it.watch.target_price && <small className="text-xs text-mut">alvo: R$ {Number(it.watch.target_price).toFixed(2)}</small>}
                  </div>
                  <div className="mt-auto flex gap-2 pt-1">
                    <button className="btn btn-danger btn-sm"
                            onClick={async () => { await api.deleteWatch(it.watch.id); load() }}>
                      <Trash2 size={12} /> parar
                    </button>
                    <Link className="btn btn-ghost btn-sm" to={`/produto/${it.product.id}`}>
                      abrir <ArrowUpRight size={12} />
                    </Link>
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
