import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Flame, LayoutGrid, SlidersHorizontal, Table2, Clock3 } from "lucide-react"
import { api } from "../lib/api"
import { brl, timeago } from "../lib/format"
import { DiscountBadge, EmptyState, ErrorState, LoadingState, MarketBadge, NoResults, Page, PageHeader, ProductImage, ScoreBadge, Stat, StatGrid, Field } from "../components/ui"
import { CopyButton, shareText } from "../components/CopyButton"
import { WhatsAppButton } from "../components/WhatsAppButton"

const TABS = [
  { id: "hot", label: "Melhores oportunidades", hint: "Selecionadas por score, desconto real e mínima histórica" },
  { id: "recent", label: "Mais recentes", hint: "Últimas ofertas captadas pelos coletores" },
]

const SORT_LABEL = {
  hot: "Melhores oportunidades",
  recent: "Mais recentes",
  discount: "Maior desconto real",
  score: "Maior score",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
}

function OfferCard({ item }) {
  const { product: p, offer: o, analysis: a, market_label } = item
  return (
    <article className="card flex h-full flex-col overflow-hidden" aria-labelledby={`offer-${p.id}`}>
      <Link to={`/produto/${p.id}`} tabIndex={-1} aria-hidden="true" className="block border-b border-slate-100">
        <ProductImage src={p.image_url} alt="" className="h-44 w-full" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <MarketBadge code={p.marketplace} label={market_label} />
          {a?.is_hist_min ? <span className="badge badge-good">Mínima histórica</span> : null}
          <span className="ml-auto text-xs text-slate-400">{timeago(o.updated_at)}</span>
        </div>
        <h2 id={`offer-${p.id}`} className="line-clamp-2 min-h-[2.6em] text-sm font-semibold leading-snug text-slate-900">
          <Link to={`/produto/${p.id}`} className="hover:text-blue-800 hover:underline">
            {p.title}
          </Link>
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-xl font-bold tracking-tight text-slate-900">{brl(o.price)}</p>
          {o.list_price > o.price ? (
            <s className="text-xs text-slate-400">{brl(o.list_price)}</s>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DiscountBadge value={a?.real_discount_pct} />
          <ScoreBadge score={a?.score} />
          {o.coupon_text ? (
            <span className="badge border-dashed border-brand-300 bg-brand-50 font-bold text-brand-800" title="Cupom aplicado no checkout do site">
              {o.coupon_text}
            </span>
          ) : null}
        </div>
        <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-1.5 pt-2">
          <Link to={`/produto/${p.id}`} className="btn-secondary w-full btn-sm" aria-label={`Ver análise de ${p.title.slice(0, 60)}`}>
            Ver análise
          </Link>
          <WhatsAppButton productId={p.id} label="" className="btn-secondary btn-sm !px-2.5" />
          <CopyButton
            text={shareText(p.title, o.price, p.url)}
            label=""
            className="btn-secondary btn-sm !px-2.5"
          />
          {item.affiliate ? (
            <p className="col-span-2 text-center text-[10.5px] text-slate-400" title="Comprar por este link apoia o Promobot com comissão — sem custo para você">
              link de afiliado
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function Pagination({ page, pages, onGo, loading, ariaLabel }) {
  if (!pages || pages <= 1) return null
  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-center gap-3 py-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page <= 1 || loading}
        onClick={() => onGo(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
      </button>
      <span className="text-sm tabular-nums text-slate-600" aria-current="page">
        Página {page} de {pages}
      </span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page >= pages || loading}
        onClick={() => onGo(page + 1)}
      >
        Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  )
}

function Filters({ filters, onChange, onClear, hasActive, open, onToggle }) {
  return (
    <section aria-label="Filtros" className="card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="feed-filters"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filtros
        {hasActive ? <span className="badge badge-info">ativos</span> : <span className="text-xs font-normal text-slate-500">opcional</span>}
        <span className="ml-auto text-xs font-medium text-slate-500">{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open ? (
        <div id="feed-filters" className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="f-market" label="Marketplace">
            <select id="f-market" className="field" value={filters.marketplace} onChange={(e) => onChange("marketplace", e.target.value)}>
              <option value="">Todos</option>
              <option value="ml">Mercado Livre</option>
              <option value="amazon">Amazon</option>
            </select>
          </Field>
          <Field id="f-cat" label="Categoria">
            <select id="f-cat" className="field" value={filters.category} onChange={(e) => onChange("category", e.target.value)}>
              <option value="">Todas</option>
              <option value="electronics">Eletrônicos</option>
              <option value="games">Jogos</option>
            </select>
          </Field>
          <Field id="f-sort" label="Ordenação detalhada">
            <select id="f-sort" className="field" value={filters.sort} onChange={(e) => onChange("sort", e.target.value)}>
              {Object.entries(SORT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field id="f-q" label="Busca por título">
            <input
              id="f-q"
              className="field"
              type="search"
              placeholder="Ex.: headset, lego, monitor…"
              defaultValue={filters.q}
              onKeyDown={(e) => {
                if (e.key === "Enter") onChange("q", e.currentTarget.value)
              }}
              onBlur={(e) => {
                if (e.currentTarget.value !== filters.q) onChange("q", e.currentTarget.value)
              }}
            />
          </Field>
          <Field id="f-score" label="Score mínimo" hint="0 a 100">
            <input
              id="f-score"
              className="field"
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              placeholder="Ex.: 60"
              defaultValue={filters.min_score}
              onKeyDown={(e) => {
                if (e.key === "Enter") onChange("min_score", e.currentTarget.value)
              }}
              onBlur={(e) => {
                if (e.currentTarget.value !== filters.min_score) onChange("min_score", e.currentTarget.value)
              }}
            />
          </Field>
          <Field id="f-max" label="Preço máximo (R$)">
            <input
              id="f-max"
              className="field"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Ex.: 1500"
              defaultValue={filters.max_price}
              onKeyDown={(e) => {
                if (e.key === "Enter") onChange("max_price", e.currentTarget.value)
              }}
              onBlur={(e) => {
                if (e.currentTarget.value !== filters.max_price) onChange("max_price", e.currentTarget.value)
              }}
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={filters.hot_only}
                onChange={(e) => onChange("hot_only", e.target.checked ? "true" : "")}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              Somente destaques
            </label>
            {hasActive ? (
              <button type="button" onClick={onClear} className="btn-secondary btn-sm">
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [kpis, setKpis] = useState(null)
  const [kpisError, setKpisError] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [view, setView] = useState(() => localStorage.getItem("pb_view") || "grid")
  const listTopRef = useRef(null)

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const filters = useMemo(
    () => ({
      q: searchParams.get("q") || "",
      marketplace: searchParams.get("marketplace") || "",
      category: searchParams.get("category") || "",
      sort: searchParams.get("sort") || "hot",
      min_score: searchParams.get("min_score") || "",
      max_price: searchParams.get("max_price") || "",
      hot_only: searchParams.get("hot_only") === "true",
    }),
    [searchParams]
  )
  const activeTab = filters.sort === "recent" ? "recent" : filters.sort === "hot" ? "hot" : null

  useEffect(() => {
    let alive = true
    api
      .stats()
      .then((d) => alive && (setKpis(d), setKpisError(false)))
      .catch(() => alive && setKpisError(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    api
      .offers({ ...filters, page, limit: 24 })
      .then((d) => alive && setData(d))
      .catch(() => alive && (setError(true), setData({ items: [], total: 0, pages: 1, page: 1 })))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [searchParams])

  const set = (k, v) => {
    const next = new URLSearchParams(searchParams)
    if (v === "" || v == null) next.delete(k)
    else next.set(k, v)
    next.delete("page")
    setSearchParams(next)
  }
  const setTab = (id) => set("sort", id)
  const hasActive =
    Boolean(filters.q || filters.marketplace || filters.category || filters.min_score || filters.max_price || filters.hot_only) ||
    (filters.sort !== "hot" && filters.sort !== "recent")

  const changeView = (v) => {
    setView(v)
    try {
      localStorage.setItem("pb_view", v)
    } catch {
      /* armazenamento indisponível */
    }
  }

  const goToPage = (n) => {
    if (n < 1 || (data && n > data.pages)) return
    const next = new URLSearchParams(searchParams)
    next.set("page", String(n))
    setSearchParams(next)
    // volta ao topo da lista de produtos (abaixo dos controles)
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const items = data?.items || []
  const total = data?.total ?? 0

  return (
    <Page labelledBy="page-title">
      <PageHeader
        title="Ofertas"
        description="Preços comparados com o histórico real coletado pelo Promobot, não com o preço riscado do anúncio."
        meta={
          kpis?.last_collect ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Última coleta {timeago(kpis.last_collect.created_at)}
            </span>
          ) : null
        }
      />

      {kpis ? (
        <StatGrid>
          <Stat label="Ofertas monitoradas" value={Number(kpis.total || 0).toLocaleString("pt-BR")} hint="Produtos acompanhados nos 3 marketplaces" />
          <Stat label="Em destaque" value={Number(kpis.hot || 0).toLocaleString("pt-BR")} hint="Score alto, mínima histórica ou queda forte" tone={kpis.hot > 0 ? "good" : undefined} />
          <Stat label="Em mínima histórica" value={Number(kpis.hist_min || 0).toLocaleString("pt-BR")} hint="Nunca estiveram tão baratas no histórico" />
          <Stat
            label="Melhor desconto real"
            value={kpis.best_discount > 0 ? `−${Math.round(kpis.best_discount)}%` : "—"}
            hint="Contra o histórico próprio do produto"
            tone={kpis.best_discount > 0 ? "good" : undefined}
          />
        </StatGrid>
      ) : kpisError ? null : (
        <LoadingState label="Carregando resumo…" />
      )}

      {/* Alternância explícita entre as duas visões principais */}
      <div role="tablist" aria-label="Modo de listagem" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const selected = filters.sort === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              {t.id === "hot" ? <Flame className="h-4 w-4" aria-hidden="true" /> : null}
              {t.label}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Formato de exibição">
          <button
            type="button"
            onClick={() => changeView("grid")}
            aria-pressed={view === "grid"}
            title="Ver em grade"
            className={`rounded-md p-2 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Ver em grade</span>
          </button>
          <button
            type="button"
            onClick={() => changeView("table")}
            aria-pressed={view === "table"}
            title="Ver em tabela"
            className={`rounded-md p-2 ${view === "table" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Table2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Ver em tabela</span>
          </button>
        </div>
      </div>

      <Filters
        filters={filters}
        onChange={set}
        onClear={() => setSearchParams({ sort: "hot" })}
        hasActive={hasActive}
        open={filtersOpen || hasActive}
        onToggle={() => setFiltersOpen((v) => !v)}
      />

      <div className="flex items-center justify-between gap-2 text-sm text-slate-600" aria-live="polite">
        <p>
          <strong className="font-bold text-slate-900">{loading ? "…" : Number(total).toLocaleString("pt-BR")}</strong>{" "}
          {total === 1 ? "oferta" : "ofertas"}
          {activeTab ? "" : ` · ordenado por ${SORT_LABEL[filters.sort] || filters.sort}`}
          {data && data.pages > 1 ? ` · página ${data.page} de ${data.pages}` : ""}
        </p>
        {loading ? <span className="text-xs text-slate-500">Atualizando lista…</span> : null}
      </div>

      <div ref={listTopRef} className="scroll-mt-3">
        {data && data.pages > 1 ? (
          <Pagination page={data.page} pages={data.pages} onGo={goToPage} loading={loading} ariaLabel="Paginação (topo da lista)" />
        ) : null}
      </div>

      {loading && !data ? (
        <LoadingState label="Buscando ofertas…" />
      ) : error ? (
        <ErrorState
          title="Falha ao carregar ofertas"
          description="Verifique sua conexão e tente novamente. Os filtros atuais foram mantidos."
          onRetry={() => window.location.reload()}
        />
      ) : items.length === 0 ? (
        <NoResults onClear={hasActive ? () => setSearchParams({ sort: "hot" }) : undefined} />
      ) : view === "grid" ? (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {items.map((d) => (
            <OfferCard key={d.product.id} item={d} />
          ))}
        </div>
      ) : (
        <div className="table-wrap" aria-busy={loading}>
          <table className="table-base">
            <caption className="sr-only">Ofertas filtradas com preço, desconto real e score</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Loja</th>
                <th scope="col" className="text-right">Preço</th>
                <th scope="col" className="text-right">Desconto real</th>
                <th scope="col" className="text-center">Score</th>
                <th scope="col"><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.product.id}>
                  <td className="max-w-[320px]">
                    <Link to={`/produto/${d.product.id}`} className="line-clamp-2 font-medium text-slate-900 hover:text-blue-800 hover:underline">
                      {d.product.title}
                    </Link>
                    <span className="mt-0.5 block text-xs text-slate-500">Atualizado {timeago(d.offer.updated_at)}</span>
                  </td>
                  <td>
                    <MarketBadge code={d.product.marketplace} label={d.market_label} />
                  </td>
                  <td className="text-right font-bold tabular-nums">{brl(d.offer.price)}</td>
                  <td className="text-right tabular-nums">
                    {d.analysis?.real_discount_pct > 0 ? (
                      <span className="font-semibold text-emerald-700">−{Math.round(d.analysis.real_discount_pct)}%</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    <ScoreBadge score={d.analysis?.score} />
                  </td>
                  <td className="text-right">
                    <Link to={`/produto/${d.product.id}`} className="btn-secondary btn-sm whitespace-nowrap">
                      Analisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={data?.page ?? 1} pages={data?.pages ?? 0} onGo={goToPage} loading={loading} ariaLabel="Paginação (fim da lista)" />

      {items.length > 0 && !activeTab ? (
        <EmptyState
          icon={Flame}
          title="Ordenação avançada ativa"
          description={`Você está vendo por "${SORT_LABEL[filters.sort]}". Volte para as visões principais quando quiser.`}
        />
      ) : null}
    </Page>
  )
}
