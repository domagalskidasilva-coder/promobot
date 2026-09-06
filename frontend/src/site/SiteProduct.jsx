// Detalhe público do produto: preço, evidência, análise + CTA afiliado.
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Award, ExternalLink, Heart, Loader2, Ticket, TrendingDown } from "lucide-react"
import { site } from "../lib/api"
import { brl, marketLabel, timeago } from "../lib/format"
import {
  DiscountBadge,
  ErrorState,
  LoadingState,
  MarketBadge,
  Page,
  ProductImage,
  ScoreBadge,
} from "../components/ui"
import { PriceHistoryChart } from "../components/charts"
import { useDocTitle } from "./components"

const PERIODS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "all", label: "Tudo" },
]

export function SiteProduct({ me }) {
  useDocTitle("")
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState("all")
  const [target, setTarget] = useState("")
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [isFav, setIsFav] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      setData(await site.product(id, period))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    setData(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period])

  useEffect(() => {
    document.title = data?.product ? `${data.product.title.slice(0, 70)} — Promobot` : "Oferta — Promobot"
  }, [data])

  useEffect(() => {
    if (me?.logged && id) {
      site.favorites().then((f) => setIsFav(f.some((x) => x.product.id === Number(id)))).catch(() => {})
      site.alerts().then((a) => {
        const hit = a.find((x) => x.product.id === Number(id))
        if (hit?.target_price) setTarget(String(hit.target_price))
      }).catch(() => {})
    }
  }, [me, id])

  const historyPoints = useMemo(() => {
    if (!data?.history) return []
    return data.history.map((h) => ({ x: new Date(h.t).getTime(), y: h.p })).filter((p) => !Number.isNaN(p.x))
  }, [data])

  if (failed) {
    return (
      <Page>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às ofertas
        </Link>
        <ErrorState title="Oferta não encontrada" description="Ela pode ter saído do catálogo." onRetry={load} />
      </Page>
    )
  }
  if (!data) return <LoadingState label="Carregando oferta…" />

  const { product: p, offer: o, analysis: a, stats } = data

  const toggleFav = async () => {
    if (!me?.logged) {
      window.location.href = `/entrar?next=${encodeURIComponent(`/produto/${p.id}`)}`
      return
    }
    setBusy(true)
    try {
      if (isFav) await site.removeFavorite(p.id)
      else await site.addFavorite(p.id)
      setIsFav(!isFav)
    } finally {
      setBusy(false)
    }
  }

  const saveAlert = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (!me?.logged) {
      window.location.href = `/entrar?next=${encodeURIComponent(`/produto/${p.id}`)}`
      return
    }
    const parsed = target === "" ? null : Number(String(target).replace(",", "."))
    if (target !== "" && !(parsed > 0)) {
      setMsg({ tone: "error", text: "Informe um preço-alvo válido maior que zero." })
      return
    }
    setBusy(true)
    try {
      await site.saveAlert(p.id, parsed)
      setMsg({ tone: "ok", text: "Alerta salvo! Avisamos por e-mail quando atingir o alvo." })
    } catch {
      setMsg({ tone: "error", text: "Não foi possível salvar. Tente novamente." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page labelledBy="page-title">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às ofertas
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="page-title" className="page-title">
            {p.title}
          </h1>
          <p className="page-sub">
            {marketLabel(p.marketplace, data.market_label)} · atualizado {timeago(o.updated_at)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MarketBadge code={p.marketplace} label={data.market_label} />
            <ScoreBadge score={a?.score} />
            {p.affiliate ? <span className="badge badge-neutral">link de afiliado</span> : null}
          </div>
        </div>
      </header>

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
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5">
            <a href={`/r/${p.id}?src=product`} target="_blank" rel="sponsored nofollow noopener" className="btn w-full">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver oferta na loja
            </a>
            <button
              type="button"
              onClick={toggleFav}
              disabled={busy}
              aria-pressed={isFav}
              title={isFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
              className={`btn-secondary btn-sm !px-2.5 ${isFav ? "!border-red-200 !bg-red-50 !text-red-700" : ""}`}
            >
              <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} aria-hidden="true" />
            </button>
          </div>
          <p className="hint">A compra é concluída no site da loja. Comprando por este link você apoia o Promobot sem pagar nada a mais.</p>
        </section>

        <section aria-label="Evidência do histórico" className="card-pad lg:col-span-1">
          <h2 className="section-title">Por que vale a pena?</h2>
          {stats ? (
            <dl className="mt-2">
              {[
                ["Menor preço registrado", brl(stats.min)],
                ["Preço médio", brl(stats.avg)],
                ["Maior preço registrado", brl(stats.max)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
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
          {a?.summary ? <p className="mt-3 border-l-2 border-blue-600 pl-3 text-sm leading-relaxed text-slate-700">{a.summary}</p> : null}
        </section>

        <section aria-label="Alerta de preço" className="card-pad lg:col-span-1">
          <h2 className="section-title">Avise-me quando baixar</h2>
          <p className="mt-0.5 text-sm text-slate-600">Defina um preço-alvo e avisamos por e-mail.</p>
          <form onSubmit={saveAlert} className="mt-3 space-y-2">
            <div>
              <label htmlFor="site-target" className="label">
                Preço-alvo (R$)
              </label>
              <input
                id="site-target"
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
            <button type="submit" className="btn w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {me?.logged ? "Criar alerta" : "Entrar para criar alerta"}
            </button>
          </form>
          {msg ? (
            <p role={msg.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm font-medium ${msg.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>
              {msg.text}
            </p>
          ) : null}
        </section>
      </div>

      <section aria-label="Histórico de preço" className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Histórico de preço</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODS.map((pd) => (
              <button
                key={pd.id}
                type="button"
                onClick={() => setPeriod(pd.id)}
                aria-pressed={period === pd.id}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
                  period === pd.id ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
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
              Histórico insuficiente. O gráfico aparece após mais coletas.
            </p>
          )}
        </div>
      </section>
    </Page>
  )
}
