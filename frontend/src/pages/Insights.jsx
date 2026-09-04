import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { TrendingDown } from "lucide-react"
import { api } from "../lib/api"
import { brl0 } from "../lib/format"
import { ErrorState, LoadingState, MarketBadge, Page, PageHeader } from "../components/ui"
import { BarChart, CycleBars, HBarList } from "../components/charts"

const MKT_COLORS = { "Mercado Livre": "#1d4ed8", Amazon: "#b45309" }

function AnalysisBlock({ question, title, unit, children, interpretation, empty }) {
  return (
    <section aria-label={question} className="card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{question}</p>
      <h2 className="section-title mt-0.5">{title}</h2>
      <p className="text-xs text-slate-500">Unidade: {unit}</p>
      <div className="mt-3">
        {empty ? (
          <p role="status" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
      {interpretation && !empty ? <p className="mt-2 border-l-2 border-slate-300 pl-3 text-[13px] leading-relaxed text-slate-600">{interpretation}</p> : null}
    </section>
  )
}

function RankedList({ items, renderRow, emptyText }) {
  if (!items || items.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        {emptyText}
      </p>
    )
  }
  return (
    <ol className="space-y-1.5">
      {items.map((x, i) => (
        <li key={x.key || `${i}-${x.id || x.product?.id}`}>
          <Link
            to={`/produto/${x.id || x.product?.id}`}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
          >
            <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</span>
            {renderRow(x)}
          </Link>
        </li>
      ))}
    </ol>
  )
}

export function InsightsPage() {
  const [d, setD] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      setD(await api.insights())
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const summary = useMemo(() => {
    if (!d) return ""
    const total = [...(d.by_market || [])].reduce((s, x) => s + (x.value || 0), 0)
    const drops = (d.drops_48h || []).length
    const best = (d.top_discounts || [])[0]
    const top = [...(d.by_market || [])].sort((a, b) => b.value - a.value)[0]
    const parts = []
    parts.push(total > 0 ? `${total.toLocaleString("pt-BR")} ofertas acompanhadas` : "catálogo ainda em formação")
    if (top) parts.push(`${top.label} concentra a maior parte`)
    if (best?.real_discount_pct > 0) parts.push(`melhor desconto real de ${Math.round(best.real_discount_pct)}%`)
    parts.push(drops > 0 ? `${drops} quedas relevantes em 48 h` : "sem quedas relevantes em 48 h")
    return `${parts.join("; ")}.`
  }, [d])

  if (!d && !failed) return <LoadingState label="Gerando análise…" />
  if (failed || !d) return <ErrorState title="Falha ao gerar insights" description="Tente novamente em alguns instantes." onRetry={load} />

  const scoreData = (d.score_hist || []).map((s) => ({
    label: `${s.bucket}–${s.bucket + 9}`,
    value: s.n,
    color: s.bucket >= 80 ? "#047857" : s.bucket >= 60 ? "#b45309" : "#94a3b8",
  }))
  const novosData = (d.novos_7d || []).map((s) => ({
    label: String(s.d).slice(5),
    value: s.n,
    color: "#1d4ed8",
  }))

  return (
    <Page labelledBy="page-title">
      <PageHeader title="Insights" description="Leitura agregada do catálogo coletado. Atualizada a cada ciclo de coleta." />

      <section aria-label="Resumo executivo" className="card-pad border-blue-200 bg-blue-50/50">
        <h2 className="section-title">Resumo executivo</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{summary}</p>
      </section>

      <AnalysisBlock
        question="Onde estão as ofertas?"
        title="Distribuição do catálogo"
        unit="quantidade de produtos"
        interpretation="Use para decidir quais marketplaces e categorias priorizar nos filtros e nas palavras-chave."
        empty={d.by_market.length === 0 ? "Sem produtos suficientes para distribuir por loja ou categoria." : null}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Por marketplace</h3>
            <HBarList rows={(d.by_market || []).map((x) => ({ label: x.label, value: x.value, color: MKT_COLORS[x.label] || "#1d4ed8" }))} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Por categoria</h3>
            <HBarList rows={(d.by_category || []).map((x) => ({ label: x.label, value: x.value, color: "#475569" }))} />
          </div>
        </div>
      </AnalysisBlock>

      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisBlock
          question="Os preços estão bons?"
          title="Distribuição do score (0–100)"
          unit="quantidade de ofertas por faixa"
          interpretation={
            scoreData.length > 0
              ? "Faixas altas concentradas à direita indicam um bom momento de compra; concentração à esquerda indica preços comuns."
              : undefined
          }
          empty={scoreData.length === 0 ? "Nenhuma análise automática concluída ainda." : null}
        >
          <BarChart data={scoreData} label="Ofertas por faixa de score" />
        </AnalysisBlock>

        <AnalysisBlock
          question="Quanto custa em média?"
          title="Ticket médio por categoria"
          unit="reais (R$) por produto"
          interpretation="Categorias com ticket alto pedem metas de monitoramento maiores na watchlist."
          empty={(d.avg_price_cat || []).length === 0 ? "Sem dados de preço médio por categoria." : null}
        >
          <dl className="space-y-2">
            {(d.avg_price_cat || []).map((c) => (
              <div key={c.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <dt className="text-sm text-slate-600">{c.label}</dt>
                <dd className="text-base font-bold tabular-nums">{brl0(c.avg)}</dd>
              </div>
            ))}
          </dl>
        </AnalysisBlock>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisBlock
          question="O que caiu de preço?"
          title="Maiores quedas em 48 h"
          unit="percentual de queda sobre o maior preço recente"
          interpretation="Quedas recentes combinadas com mínima histórica costumam ser as melhores janelas de compra."
          empty={(d.drops_48h || []).length === 0 ? "Nenhuma queda relevante nas últimas 48 horas." : null}
        >
          <RankedList
            items={d.drops_48h}
            emptyText="Nenhuma queda relevante nas últimas 48 horas."
            renderRow={(x) => (
              <>
                <MarketBadge code={x.marketplace} label={x.market_label} />
                <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-slate-800">{x.title}</span>
                <s className="hidden text-xs text-slate-400 sm:inline">{brl0(x.was)}</s>
                <strong className="text-sm tabular-nums">{brl0(x.price)}</strong>
                <span className="badge badge-good">−{x.drop_pct}%</span>
              </>
            )}
          />
        </AnalysisBlock>

        <AnalysisBlock
          question="Onde está o maior desconto real?"
          title="Maiores descontos vs. histórico"
          unit="percentual abaixo do histórico próprio"
          interpretation="Desconto aqui é contra o histórico medido, não contra o preço riscado do anúncio."
          empty={(d.top_discounts || []).length === 0 ? "Ainda sem descontos reais calculados." : null}
        >
          <RankedList
            items={d.top_discounts}
            emptyText="Ainda sem descontos reais calculados."
            renderRow={(x) => (
              <>
                <MarketBadge code={x.product.marketplace} label={x.market_label} />
                <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-slate-800">{x.product.title}</span>
                <strong className="text-sm tabular-nums">{brl0(x.price)}</strong>
                {x.real_discount_pct > 0 ? <span className="badge badge-good">−{Math.round(x.real_discount_pct)}%</span> : null}
              </>
            )}
          />
        </AnalysisBlock>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisBlock
          question="O catálogo está crescendo?"
          title="Novos produtos (7 dias)"
          unit="novos produtos por dia"
          interpretation="Barras zeradas em sequência podem indicar falha de coleta — confira a página Status."
          empty={novosData.length < 1 ? "Poucos dias de histórico. O gráfico cresce com os ciclos." : null}
        >
          <BarChart data={novosData} label="Novos produtos por dia nos últimos 7 dias" />
        </AnalysisBlock>

        <AnalysisBlock
          question="A coleta está saudável?"
          title="Últimos ciclos de coleta"
          unit="produtos coletados (azul) e novos (verde) por ciclo"
          interpretation="Quedas abruptas de volume ou ausência de barras verdes pedem investigação no Status."
          empty={(d.cycles || []).length === 0 ? "Nenhum ciclo registrado ainda." : null}
        >
          <CycleBars cycles={d.cycles} />
        </AnalysisBlock>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        Análises calculadas sobre o histórico coletado. A interpretação automática pode conter erros — confira sempre a página do produto.
      </p>
    </Page>
  )
}
