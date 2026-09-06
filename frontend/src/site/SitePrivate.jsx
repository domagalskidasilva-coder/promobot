// Páginas que exigem login do site: favoritos e conta.
import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { ExternalLink, Heart, Loader2, LogOut, Trash2, TriangleAlert } from "lucide-react"
import { site } from "../lib/api"
import { brl, timeago } from "../lib/format"
import { EmptyState, ErrorState, LoadingState, MarketBadge, Page, PageHeader, ProductImage } from "../components/ui"
import { useDocTitle } from "./components"

function RequireLogin({ me, children }) {
  if (me === null) return <LoadingState label="Verificando sessão…" />
  if (!me.logged) return <Navigate to="/entrar?next=/favoritos" replace />
  return children
}

export function SiteFavorites({ me }) {
  useDocTitle("Favoritos")
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(null)

  const load = async () => {
    setFailed(false)
    try {
      setItems(await site.favorites())
    } catch {
      setFailed(true)
    }
  }
  useEffect(() => {
    if (me?.logged) load()
  }, [me])

  const remove = async (productId) => {
    setBusy(productId)
    try {
      await site.removeFavorite(productId)
      setItems((list) => (list || []).filter((x) => x.product.id !== productId))
    } finally {
      setBusy(null)
    }
  }

  return (
    <RequireLogin me={me}>
      <Page labelledBy="page-title">
        <PageHeader title="Meus favoritos" description="Ofertas que você salvou para acompanhar." />
        {items === null ? (
          failed ? <ErrorState title="Falha ao carregar favoritos" onRetry={load} /> : <LoadingState label="Carregando favoritos…" />
        ) : items.length === 0 ? (
          <EmptyState icon={Heart} title="Nenhum favorito ainda" description="Toque no coração de uma oferta para salvá-la aqui." action={<Link to="/" className="btn">Ver ofertas</Link>} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((x) => (
              <article key={x.product.id} className="card flex flex-col overflow-hidden">
                <Link to={`/produto/${x.product.id}`} tabIndex={-1} aria-hidden="true" className="block border-b border-slate-100">
                  <ProductImage src={x.product.image_url} alt="" className="h-36 w-full" />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <MarketBadge code={x.product.marketplace} label={x.market_label} />
                  <h2 className="line-clamp-2 text-sm font-semibold text-slate-900">
                    <Link to={`/produto/${x.product.id}`} className="hover:text-blue-800 hover:underline">{x.product.title}</Link>
                  </h2>
                  <p className="text-lg font-bold tabular-nums">{brl(x.offer.price)} <span className="text-xs font-normal text-slate-400">· {timeago(x.offer.updated_at)}</span></p>
                  <div className="mt-auto grid grid-cols-[1fr_auto] gap-1.5 pt-1">
                    <a href={`/r/${x.product.id}?src=fav`} target="_blank" rel="sponsored nofollow noopener" className="btn w-full btn-sm">
                      <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver oferta
                    </a>
                    <button type="button" onClick={() => remove(x.product.id)} disabled={busy === x.product.id} className="btn-danger btn-sm" aria-label="Remover dos favoritos">
                      {busy === x.product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Page>
    </RequireLogin>
  )
}

export function SiteAccount({ me, onLogout }) {
  useDocTitle("Minha conta")
  const [alerts, setAlerts] = useState(null)
  const [name, setName] = useState("")
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (me?.logged) {
      setName(me.user?.name || "")
      site.alerts().then(setAlerts).catch(() => setAlerts([]))
    }
  }, [me])

  if (me === null) return <LoadingState label="Verificando sessão…" />
  if (!me.logged) return <Navigate to="/entrar?next=/conta" replace />

  const saveName = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await site.updateMe({ name })
      setMsg({ tone: "ok", text: "Nome atualizado." })
    } catch {
      setMsg({ tone: "error", text: "Não foi possível salvar." })
    } finally {
      setBusy(false)
    }
  }

  const removeAlert = async (productId) => {
    await site.deleteAlert(productId)
    setAlerts((l) => (l || []).filter((x) => x.product.id !== productId))
  }

  const del = async () => {
    if (!window.confirm("Excluir sua conta e apagar favoritos e alertas? Essa ação não pode ser desfeita.")) return
    await site.deleteMe()
    onLogout()
  }

  return (
    <Page labelledBy="page-title">
      <PageHeader
        title="Minha conta"
        description={me.user?.email || ""}
        actions={
          <button type="button" onClick={onLogout} className="btn-secondary btn-sm">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
          </button>
        }
      />
      <section aria-label="Perfil" className="card-pad max-w-xl">
        <h2 className="section-title">Perfil</h2>
        <form onSubmit={saveName} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="acc-name" className="label">Nome</label>
            <input id="acc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <button type="submit" className="btn shrink-0" disabled={busy}>Salvar</button>
        </form>
        {msg ? <p role="status" className={`mt-2 text-sm font-medium ${msg.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p> : null}
      </section>

      <section aria-label="Meus alertas de preço" className="card-pad">
        <h2 className="section-title">Alertas de preço</h2>
        {alerts === null ? (
          <LoadingState label="Carregando alertas…" />
        ) : alerts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum alerta. Abra uma oferta e defina um preço-alvo.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {alerts.map((x) => (
              <li key={x.product.id} className="flex items-center gap-3 py-2.5">
                <ProductImage src={x.product.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-100" />
                <div className="min-w-0 flex-1">
                  <Link to={`/produto/${x.product.id}`} className="line-clamp-1 text-sm font-medium text-slate-900 hover:underline">{x.product.title}</Link>
                  <p className="text-xs text-slate-500">Atual {brl(x.offer.price)} · alvo {brl(x.target_price)}</p>
                </div>
                <button type="button" onClick={() => removeAlert(x.product.id)} className="btn-danger btn-sm" aria-label={`Excluir alerta de ${x.product.title.slice(0, 40)}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Zona de perigo" className="card-pad border-red-200">
        <h2 className="section-title flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-red-600" aria-hidden="true" /> Excluir conta</h2>
        <p className="mt-1 text-sm text-slate-600">Apaga seu cadastro, favoritos e alertas (LGPD, art. 18).</p>
        <button type="button" onClick={del} className="btn-danger mt-3">Excluir minha conta</button>
      </section>
    </Page>
  )
}
