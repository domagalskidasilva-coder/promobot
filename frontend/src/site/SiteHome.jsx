// Vitrine pública: hero + KPIs + busca/filtros + grade de ofertas afiliadas.
import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Flame } from "lucide-react"
import { site } from "../lib/api"
import { timeago } from "../lib/format"
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  NoResults,
  Page,
  Stat,
  StatGrid,
} from "../components/ui"
import { SiteOfferCard, useDocTitle } from "./components"

export function SiteHome({ me, settings }) {
  useDocTitle("")
  const [searchParams, setSearchParams] = useSearchParams()
  const [kpis, setKpis] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [favs, setFavs] = useState(null)
  const [favBusy, setFavBusy] = useState(null)

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const filters = useMemo(
    () => ({
      q: searchParams.get("q") || "",
      marketplace: searchParams.get("marketplace") || "",
      category: searchParams.get("category") || "",
      sort: searchParams.get("sort") || "hot",
      hot_only: searchParams.get("hot_only") === "true",
    }),
    [searchParams]
  )

  useEffect(() => {
    site.stats().then(setKpis).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    site
      .offers({ ...filters, page, limit: 24 })
      .then((d) => alive && setData(d))
      .catch(() => alive && (setError(true), setData({ items: [], total: 0, pages: 1, page: 1 })))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [searchParams])

  useEffect(() => {
    if (me?.logged) site.favorites().then((f) => setFavs(new Set(f.map((x) => x.product.id)))).catch(() => setFavs(new Set()))
    else setFavs(null)
  }, [me])

  const set = (k, v) => {
    const next = new URLSearchParams(searchParams)
    if (v === "" || v == null) next.delete(k)
    else next.set(k, v)
    next.delete("page")
    setSearchParams(next)
  }

  const toggleFav = async (productId, isFav) => {
    if (!me?.logged) {
      window.location.href = `/entrar?next=${encodeURIComponent(`/produto/${productId}`)}`
      return
    }
    setFavBusy(productId)
    try {
      if (isFav) {
        await site.removeFavorite(productId)
        setFavs((s) => new Set([...(s || [])].filter((id) => id !== productId)))
      } else {
        await site.addFavorite(productId)
        setFavs((s) => new Set([...(s || []), productId]))
      }
    } finally {
      setFavBusy(null)
    }
  }

  const goToPage = (n) => {
    if (n < 1 || (data && n > data.pages)) return
    const next = new URLSearchParams(searchParams)
    next.set("page", String(n))
    setSearchParams(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const items = data?.items || []
  const total = data?.total ?? 0
  const title = settings?.site_title || "Ofertas selecionadas"
  const tagline = settings?.site_tagline || "Preços comparados com o histórico real, não com o preço riscado do anúncio."

  return (
    <Page labelledBy="page-title">
      <header className="card-pad bg-gradient-to-br from-brand-600 to-brand-800 !border-0 text-white">
        <h1 id="page-title" className="!text-white page-title">
          {title}
        </h1>
        <p className="page-sub !text-blue-100">{settings?.hero_text || tagline}</p>
        {settings?.whatsapp_url ? (
          <a href={settings.whatsapp_url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3 !border-0">
            Entrar no canal de ofertas
          </a>
        ) : null}
      </header>

      {kpis ? (
        <StatGrid>
          <Stat label="Ofertas" value={Number(kpis.total || 0).toLocaleString("pt-BR")} />
          <Stat label="Em destaque" value={Number(kpis.hot || 0).toLocaleString("pt-BR")} tone={kpis.hot > 0 ? "good" : undefined} />
          <Stat label="Mínima histórica" value={Number(kpis.hist_min || 0).toLocaleString("pt-BR")} />
          <Stat
            label="Melhor desconto"
            value={kpis.best_discount > 0 ? `−${Math.round(kpis.best_discount)}%` : "—"}
            tone={kpis.best_discount > 0 ? "good" : undefined}
          />
        </StatGrid>
      ) : null}

      <section aria-label="Filtros" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="s-q" label="Buscar">
          <input
            id="s-q"
            className="field"
            type="search"
            placeholder="Ex.: headset, monitor…"
            defaultValue={filters.q}
            onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)}
            onBlur={(e) => e.currentTarget.value !== filters.q && set("q", e.currentTarget.value)}
          />
        </Field>
        <Field id="s-mp" label="Loja">
          <select id="s-mp" className="field" value={filters.marketplace} onChange={(e) => set("marketplace", e.target.value)}>
            <option value="">Todas</option>
            <option value="ml">Mercado Livre</option>
            <option value="amazon">Amazon</option>
          </select>
        </Field>
        <Field id="s-cat" label="Categoria">
          <select id="s-cat" className="field" value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Todas</option>
            <option value="electronics">Eletrônicos</option>
            <option value="games">Jogos</option>
          </select>
        </Field>
        <Field id="s-sort" label="Ordenar">
          <select id="s-sort" className="field" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="hot">Melhores oportunidades</option>
            <option value="recent">Mais recentes</option>
            <option value="discount">Maior desconto</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
          </select>
        </Field>
        <div className="flex items-end pb-0.5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={filters.hot_only}
              onChange={(e) => set("hot_only", e.target.checked ? "true" : "")}
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            Só destaques
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
        <p>
          <strong className="font-bold text-slate-900">{loading ? "…" : Number(total).toLocaleString("pt-BR")}</strong>{" "}
          {total === 1 ? "oferta" : "ofertas"}
          {kpis?.last_collect ? <span className="text-xs"> · atualizadas {timeago(kpis.last_collect.created_at)}</span> : null}
        </p>
      </div>

      {loading && !data ? (
        <LoadingState label="Buscando ofertas…" />
      ) : error ? (
        <ErrorState title="Falha ao carregar ofertas" description="Verifique sua conexão e tente novamente." onRetry={() => window.location.reload()} />
      ) : items.length === 0 ? (
        <NoResults homeTo="/" onClear={() => setSearchParams({})} />
      ) : (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {items.map((d) => (
            <SiteOfferCard
              key={d.product.id}
              item={d}
              isFav={favs?.has(d.product.id)}
              favBusy={favBusy === d.product.id}
              onToggleFav={toggleFav}
            />
          ))}
        </div>
      )}

      {data && data.pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3 py-2">
          <button type="button" className="btn-secondary btn-sm" disabled={data.page <= 1 || loading} onClick={() => goToPage(data.page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
          </button>
          <span className="text-sm tabular-nums text-slate-600">
            Página {data.page} de {data.pages}
          </span>
          <button type="button" className="btn-secondary btn-sm" disabled={data.page >= data.pages || loading} onClick={() => goToPage(data.page + 1)}>
            Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      {!me?.logged ? (
        <EmptyState
          icon={Flame}
          title="Salve favoritos e crie alertas de preço"
          description="Entre com sua conta Google para favoritar ofertas e ser avisado por e-mail quando o preço cair."
          action={
            <Link to="/entrar" className="btn">
              Entrar
            </Link>
          }
        />
      ) : null}
    </Page>
  )
}
