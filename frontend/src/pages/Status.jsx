import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react"
import { api } from "../lib/api"
import { timeago } from "../lib/format"
import { ErrorState, LoadingState, Page, PageHeader } from "../components/ui"

const SITES = [
  { id: "ml", label: "Mercado Livre" },
  { id: "amazon", label: "Amazon" },
]

function siteStatus(info) {
  if (!info?.last_ok) return { tone: "empty", label: "Sem coleta", Icon: MinusCircle, cls: "badge-neutral" }
  if ((info.errors_24h || 0) > 0) return { tone: "error", label: "Com erros", Icon: AlertTriangle, cls: "badge-bad" }
  return { tone: "ok", label: "Funcionando", Icon: CheckCircle2, cls: "badge-good" }
}

export function StatusPage() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      setData(await api.status())
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (!data && !failed) return <LoadingState label="Verificando saúde do sistema…" />
  if (failed || !data) return <ErrorState title="Falha ao carregar o status" description="Tente novamente em alguns instantes." onRetry={load} />

  const { kpis, sources, events } = data
  const errors = (events || []).filter((e) => e.level === "error").length

  return (
    <Page labelledBy="page-title">
      <PageHeader title="Status do sistema" description="Saúde da coleta e do catálogo, da visão geral ao detalhe técnico." />

      {/* 1. Saúde geral */}
      <section aria-label="Saúde geral" className="card-pad">
        <h2 className="section-title">Saúde geral</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Produtos no catálogo", value: Number(kpis.total || 0).toLocaleString("pt-BR") },
            { label: "Na lista de monitoradas", value: Number(kpis.watch || 0).toLocaleString("pt-BR") },
            { label: "Análises concluídas", value: Number(kpis.ai_ok || 0).toLocaleString("pt-BR") },
            { label: "Análise automática", value: kpis.ai_enabled ? "Ativada" : "Desativada" },
            { label: "Alertas por e-mail", value: kpis.email_configured ? "Configurado" : "Não configurado" },
          ].map((c) => (
            <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-lg font-bold tabular-nums text-slate-900">{c.value}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </div>
          ))}
        </div>
        {errors > 0 ? (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-red-700">
            <XCircle className="h-4 w-4" aria-hidden="true" /> {errors} erro(s) nos eventos recentes. Veja o detalhe abaixo.
          </p>
        ) : null}
      </section>

      {/* 2. Coleta por marketplace */}
      <section aria-label="Coleta por marketplace">
        <h2 className="section-title mb-2">Coleta por marketplace</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {SITES.map((s) => {
            const info = sources?.[s.id]
            const st = siteStatus(info)
            return (
              <li key={s.id} className="card-pad">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{s.label}</h3>
                  <span className={`badge ${st.cls}`}>
                    <st.Icon className="h-3 w-3" aria-hidden="true" /> {st.label}
                  </span>
                </div>
                {info?.last_ok ? (
                  <p className="mt-1.5 text-[13px] text-slate-600">
                    Última coleta <strong className="text-slate-900">{timeago(info.last_ok)}</strong>
                    {info.errors_24h > 0 ? (
                      <span className="font-semibold text-red-700"> · {info.errors_24h} erro(s) em 24 h</span>
                    ) : (
                      <span className="text-slate-500"> · sem erros em 24 h</span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13px] text-slate-500">Nenhuma coleta bem-sucedida registrada.</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* 3. Eventos (secundário, colapsável) */}
      <section aria-label="Eventos recentes" className="card">
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          aria-expanded={showLog}
          aria-controls="status-events"
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
        >
          <span>
            <span className="block text-sm font-bold text-slate-900">Eventos recentes (detalhe técnico)</span>
            <span className="block text-xs text-slate-500">Últimos {(events || []).length} registros do coletor e do pipeline</span>
          </span>
          <span className="text-xs font-semibold text-slate-500">{showLog ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showLog ? (
          <div id="status-events" className="table-wrap rounded-none border-x-0 border-b-0">
            <table className="table-base">
              <caption className="sr-only">Eventos recentes do sistema</caption>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Nível</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {(events || []).map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap tabular-nums text-slate-500">{timeago(e.created_at)}</td>
                    <td>
                      <span className={`badge ${e.level === "info" ? "badge-good" : e.level === "warn" ? "badge-warn" : "badge-bad"}`}>
                        {e.level}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-slate-500">{e.scope}</td>
                    <td className="max-w-[420px] break-words font-mono text-xs text-slate-700">{String(e.message).slice(0, 200)}</td>
                  </tr>
                ))}
                {(events || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nenhum evento registrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </Page>
  )
}
