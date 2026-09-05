import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { BellRing, Target, Trash2 } from "lucide-react"
import { api } from "../lib/api"
import { brl, timeago } from "../lib/format"
import { EmptyState, ErrorState, LoadingState, MarketBadge, Page, PageHeader, ProductImage, Stat, StatGrid } from "../components/ui"
import { WhatsAppButton } from "../components/WhatsAppButton"

export function WatchlistPage() {
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = async () => {
    setFailed(false)
    try {
      setItems(await api.watchlist())
    } catch {
      setFailed(true)
      setItems([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (watchId, title) => {
    if (!window.confirm(`Parar de monitorar "${title.slice(0, 80)}"?`)) return
    setRemoving(watchId)
    try {
      await api.deleteWatch(watchId)
      setNotice({ tone: "ok", text: "Produto removido da lista." })
      load()
    } catch {
      setNotice({ tone: "error", text: "Não foi possível remover. Tente novamente." })
    } finally {
      setRemoving(null)
    }
  }

  if (items === null) return <LoadingState label="Carregando lista de monitoradas…" />

  const hits = items.filter((it) => it.hit).length

  return (
    <Page labelledBy="page-title">
      <PageHeader
        title="Produtos monitorados"
        description="Acompanhe o preço atual contra a sua meta. O aviso é enviado quando o preço atinge o alvo."
      />

      {failed ? (
        <ErrorState title="Falha ao carregar a lista" description="Tente novamente em alguns instantes." onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum produto monitorado"
          description="Abra uma oferta e defina um preço-alvo para começar a acompanhar."
          action={
            <Link to="/" className="btn">
              Ver ofertas
            </Link>
          }
        />
      ) : (
        <>
          <StatGrid>
            <Stat label="Monitorados" value={items.length} />
            <Stat label="Atingiram o alvo" value={hits} tone={hits > 0 ? "good" : undefined} hint={hits > 0 ? "Hora de conferir a oferta" : "Nenhum alvo atingido ainda"} />
          </StatGrid>

          {notice ? (
            <p role={notice.tone === "error" ? "alert" : "status"} className={`text-sm font-medium ${notice.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>
              {notice.text}
            </p>
          ) : null}

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => {
              const distance =
                it.watch.target_price != null ? Number(it.offer.price) - Number(it.watch.target_price) : null
              return (
                <li key={it.watch.id} className={`card overflow-hidden ${it.hit ? "border-emerald-300" : ""}`}>
                  {it.hit ? (
                    <p className="flex items-center justify-center gap-1.5 bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                      <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> Atingiu o preço-alvo
                    </p>
                  ) : null}
                  <Link to={`/produto/${it.product.id}`} tabIndex={-1} aria-hidden="true" className="block border-b border-slate-100">
                    <ProductImage src={it.product.image_url} alt="" className="h-36 w-full" />
                  </Link>
                  <div className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <MarketBadge code={it.product.marketplace} label={it.market_label} />
                      <span className="ml-auto text-xs text-slate-400">{timeago(it.offer.updated_at)}</span>
                    </div>
                    <h2 className="line-clamp-2 min-h-[2.6em] text-sm font-semibold leading-snug">
                      <Link to={`/produto/${it.product.id}`} className="hover:text-blue-800 hover:underline">
                        {it.product.title}
                      </Link>
                    </h2>
                    <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Preço atual</dt>
                        <dd className="font-bold tabular-nums text-slate-900">{brl(it.offer.price)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Sua meta</dt>
                        <dd className="font-bold tabular-nums text-slate-900">
                          {it.watch.target_price != null ? brl(it.watch.target_price) : "—"}
                        </dd>
                      </div>
                      <div className="col-span-2 border-t border-slate-200 pt-1.5">
                        <dt className="text-xs text-slate-500">Distância da meta</dt>
                        <dd className={`font-semibold tabular-nums ${distance != null && distance <= 0 ? "text-emerald-700" : "text-slate-700"}`}>
                          {distance == null
                            ? "Defina uma meta na página do produto"
                            : distance <= 0
                              ? `${brl(Math.abs(distance))} abaixo da meta`
                              : `Faltam ${brl(distance)}`}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex gap-2 pt-1">
                      <Link to={`/produto/${it.product.id}`} className="btn-secondary flex-1 btn-sm">
                        Abrir análise
                      </Link>
                      <WhatsAppButton productId={it.product.id} />
                      <CopyButton
                        text={shareText(it.product.title, it.offer.price, it.product.url)}
                        className="btn-secondary btn-sm"
                      />
                      <button
                        type="button"
                        onClick={() => remove(it.watch.id, it.product.title)}
                        disabled={removing === it.watch.id}
                        className="btn-danger btn-sm"
                        aria-label={`Parar de monitorar ${it.product.title.slice(0, 60)}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {removing === it.watch.id ? "…" : "Remover"}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Page>
  )
}
