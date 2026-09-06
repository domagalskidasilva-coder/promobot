// Páginas públicas de cupons e lojas.
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ExternalLink, Store as StoreIcon, Ticket } from "lucide-react"
import { site } from "../lib/api"
import { brl, marketLabel, timeago } from "../lib/format"
import { EmptyState, ErrorState, LoadingState, MarketBadge, Page, PageHeader, ProductImage } from "../components/ui"
import { useDocTitle } from "./components"

export function SiteCoupons() {
  useDocTitle("Cupons")
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    site.coupons().then(setItems).catch(() => setFailed(true))
  }, [])
  if (items === null) return failed ? <ErrorState title="Falha ao carregar cupons" onRetry={() => window.location.reload()} /> : <LoadingState label="Buscando cupons…" />
  return (
    <Page labelledBy="page-title">
      <PageHeader title="Cupons" description="Descontos com cupom aplicado no checkout da loja." />
      {items.length === 0 ? (
        <EmptyState icon={Ticket} title="Nenhum cupom no momento" description="Volte em breve — os cupons são atualizados a cada coleta." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <article key={`${c.marketplace}-${c.id}`} className="card-pad flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <MarketBadge code={c.marketplace} label={c.market_label} />
                <span className="ml-auto text-xs text-slate-400">{timeago(c.last_seen)}</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-3 py-2">
                <Ticket className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <b className="text-sm text-brand-800">{c.description}</b>
              </div>
              <div className="flex items-center gap-2">
                <ProductImage src={c.image_url} alt="" className="h-12 w-12 rounded-lg border border-slate-100" />
                <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-slate-800">{c.title}</p>
                <b className="shrink-0 tabular-nums text-slate-900">{brl(c.price)}</b>
              </div>
              <a href={`/r/${c.product_id}?src=coupon`} target="_blank" rel="sponsored nofollow noopener" className="btn w-full btn-sm">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Usar cupom na loja
              </a>
            </article>
          ))}
        </div>
      )}
    </Page>
  )
}

export function SiteStores() {
  useDocTitle("Lojas")
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    site.stores().then(setItems).catch(() => setFailed(true))
  }, [])
  if (items === null) return failed ? <ErrorState title="Falha ao carregar lojas" onRetry={() => window.location.reload()} /> : <LoadingState label="Buscando lojas…" />
  return (
    <Page labelledBy="page-title">
      <PageHeader title="Lojas monitoradas" description="Lojas e marcas acompanhadas pelo coletor." />
      {items.length === 0 ? (
        <EmptyState icon={StoreIcon} title="Nenhuma loja ativa" description="As lojas monitoradas aparecem aqui." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <article key={s.id} className="card-pad">
              <h2 className="text-sm font-bold text-slate-900">{s.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{marketLabel(s.marketplace, s.marketplace)} · {s.query}</p>
              <div className="mt-3 flex gap-1.5">
                <Link to={`/?q=${encodeURIComponent(s.query)}`} className="btn-secondary btn-sm flex-1">
                  Ver ofertas
                </Link>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </Page>
  )
}
