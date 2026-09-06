import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { CopyButton, shareText } from "../components/CopyButton"
import { WhatsAppButton } from "../components/WhatsAppButton"
import { ArrowLeft, Award, ExternalLink, Eye, Loader2, Ticket, TrendingDown } from "lucide-react"
import { api } from "../lib/api"
import { brl, marketLabel, timeago } from "../lib/format"
import { DiscountBadge, ErrorState, LoadingState, MarketBadge, Page, PageHeader, ProductImage, ScoreBadge } from "../components/ui"
import { PriceHistoryChart } from "../components/charts"

const PERIODS = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "all", label: "Todo o período", days: null },
]

async function fetchProduct(id, period) {
  // api.js preservado; o backend aceita ?period= — usamos fetch direto com o mesmo contrato.
  const res = await fetch(`/api/product/${id}?period=${encodeURIComponent(period)}`, { credentials: "same-origin" })
  if (res.status === 303 || res.status === 401 || res.status === 403) throw new Error("unauthorized")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function EvidenceRow({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold tabular-nums text-slate-900" title={hint || undefined}>
        {value}
      </dd>
    </div>
  )
}

export function ProductPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState("all")
  const [target, setTarget] = useState("")
  const [watchMsg, setWatchMsg] = useState(null)
  const [watchBusy, setWatchBusy] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      const d = await fetchProduct(id, period)
      setData(d)
      setTarget(d.watched?.target_price ?? "")
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    setData(null)
    setWatchMsg(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period])

  const historyPoints = useMemo(() => {
    if (!data?.history) return []
    return data.history.map((h) => ({ x: new Date(h.t).getTime(), y: h.p })).filter((p) => !Number.isNaN(p.x))
  }, [data])

  if (failed) {
    return (
      <Page>
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às ofertas
        </Link>
        <ErrorState
          title="Produto não encontrado ou indisponível"
          description="O produto pode ter sido removido do catálogo ou a conexão falhou."
          onRetry={load}
        />
      </Page>
    )
  }

  if (!data) return <LoadingState label="Carregando produto…" />

  const { product: p, offer: o, analysis: a, stats, watched } = data

  const watch = async (e) => {
    e.preventDefault()
    setWatchBusy(true)
    setWatchMsg(null)
    try {
      const parsed = target === "" ? null : Number(String(target).replace(",", "."))
      if (target !== "" && !(parsed > 0)) {
        setWatchMsg({ tone: "error", text: "Informe um preço-alvo válido maior que zero." })
        return
      }
      await api.addWatch(p.id, parsed)
      setWatchMsg({ tone: "ok", text: watched ? "Preço-alvo atualizado." : "Produto adicionado à lista de monitoradas." })
      load()
    } catch {
      setWatchMsg({ tone: "error", text: "Não foi possível salvar. Tente novamente." })
    } finally {
      setWatchBusy(false)
    }
  }

  const verdict =
    a?.score >= 80
      ? "Preço muito bom pelo histórico. Vale considerar a compra."
      : a?.score >= 60
        ? "Preço bom, mas confira o histórico antes de decidir."
        : a?.score != null
          ? "Preço comum para este produto. Aguarde uma queda maior, se possível."
          : "Ainda sem avaliação automática para este produto."

  return (
    <Page labelledBy="page-title">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às ofertas
      </Link>

      <PageHeader
        title={p.title}
        description={`${marketLabel(p.marketplace, data.market_label)} · atualizado ${timeago(o.updated_at)}`}
        meta={
          <>
            <MarketBadge code={p.marketplace} label={data.market_label} />
            <span className={`badge ${o.in_stock ? "badge-good" : "badge-warn"}`}>{o.in_stock ? "Em estoque" : "Sem estoque"}</span>
            {p.category ? <span className="badge badge-neutral">{p.category === "games" ? "Jogos" : "Eletrônicos"}</span> : null}
            <ScoreBadge score={a?.score} />
          </>
        }
      />

      {/* Resumo de decisão: preço + ação + evidência */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section aria-label="Resumo da oferta" className="card-pad lg:col-span-1">
          <ProductImage src={p.image_url} alt={`Imagem de ${p.title}`} className="h-52 w-full rounded-lg border border-slate-100" />
          <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums text-slate-900">{brl(o.price)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {o.list_price > o.price ? <s className="text-slate-400">{brl(o.list_price)}</s> : null}
            <DiscountBadge value={a?.real_discount_pct} />
          </p>
          {o.coupon_text ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-3 py-2">
              <Ticket className="h-4 w-4 text-brand-700" aria-hidden="true" />
              <b className="text-sm text-brand-800">{o.coupon_text}</b>
              <span className="text-[11px] text-slate-500">aplicado no checkout</span>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-1.5">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn w-full">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir oferta na loja
            </a>
            <WhatsAppButton productId={p.id} />
            <CopyButton text={shareText(p.title, o.price, p.url)} className="btn-secondary btn-sm" />
          </div>
          <p className="hint">A compra é concluída no site da loja. O Promobot não vende produtos.</p>
        </section>

        <section aria-label="Evidência do histórico" className="card-pad lg:col-span-1">
          <h2 className="section-title">Evidência do histórico</h2>
          <p className="mt-0.5 text-xs text-slate-500">Dados medidos pelo coletor. Não é opinião.</p>
          {stats ? (
            <dl className="mt-2">
              <EvidenceRow label="Menor preço no período" value={brl(stats.min)} />
              <EvidenceRow label="Preço médio no período" value={brl(stats.avg)} />
              <EvidenceRow label="Maior preço no período" value={brl(stats.max)} />
              <EvidenceRow label="Leituras de preço" value={Number(stats.n_points).toLocaleString("pt-BR")} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Ainda há poucas leituras para resumir este produto.</p>
          )}
          <ul className="mt-3 space-y-1.5 text-sm">
            {a?.is_hist_min ? (
              <li className="flex items-center gap-1.5 font-medium text-emerald-700">
                <Award className="h-4 w-4" aria-hidden="true" /> Menor preço já registrado
              </li>
            ) : null}
            {a?.vs_avg30_pct != null ? (
              <li className="flex items-center gap-1.5 text-slate-700">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
                {Number(a.vs_avg30_pct).toFixed(1)}% em relação à média de 30 dias
              </li>
            ) : null}
          </ul>
          {(a?.flags || []).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Alertas">
              {a.flags.map((f) => (
                <span key={f} className="badge badge-warn">
                  {f}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-label="Análise automática" className="card-pad border-blue-200 lg:col-span-1">
          <h2 className="section-title">Análise automática</h2>
          <p className="mt-0.5 text-xs text-slate-500">Interpretação gerada por IA a partir do histórico. Pode conter erros.</p>
          {a?.score != null || a?.summary ? (
            <>
              <p className="mt-3 border-l-2 border-blue-600 pl-3 text-sm font-medium leading-relaxed text-slate-800">{verdict}</p>
              {a?.summary ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{a.summary}</p> : null}
              {a?.ai_analyzed_at ? <p className="mt-2 text-xs text-slate-400">Analisado {timeago(a.ai_analyzed_at)}</p> : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Este produto ainda não passou pela análise automática.</p>
          )}
        </section>
      </div>

      {/* Histórico */}
      <section aria-label="Histórico de preço" className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Histórico de preço</h2>
            <p className="text-xs text-slate-500">Valores em reais (R$) captados pelo coletor.</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período do histórico">
            {PERIODS.map((pd) => (
              <button
                key={pd.id}
                type="button"
                onClick={() => setPeriod(pd.id)}
                aria-pressed={period === pd.id}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
                  period === pd.id
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {pd.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          {historyPoints.length >= 2 ? (
            <PriceHistoryChart points={historyPoints} label={`Histórico de preço de ${p.title}`} />
          ) : (
            <p role="status" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Histórico insuficiente. O gráfico aparece após mais ciclos de coleta.
            </p>
          )}
        </div>
      </section>

      {/* Monitoramento */}
      <section aria-label="Monitorar preço" className="card-pad">
        <h2 className="section-title flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-500" aria-hidden="true" /> Monitorar este produto
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">
          {watched ? "Este produto já está na sua lista. Ajuste o preço-alvo quando quiser." : "Receba um aviso quando o preço atingir sua meta."}
        </p>
        <form onSubmit={watch} className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="watch-target" className="label">
              Preço-alvo (R$)
            </label>
            <input
              id="watch-target"
              className="field"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Ex.: 899,90"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <button type="submit" className="btn shrink-0" disabled={watchBusy}>
            {watchBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {watched ? "Atualizar alvo" : "Monitorar"}
          </button>
        </form>
        {watchMsg ? (
          <p role={watchMsg.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm font-medium ${watchMsg.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>
            {watchMsg.text}
          </p>
        ) : null}
      </section>
    </Page>
  )
}
