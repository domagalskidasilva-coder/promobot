import { useEffect, useState } from "react"
import { Pause, Play, Plus, Tag, Trash2 } from "lucide-react"
import { api } from "../lib/api"
import { timeago } from "../lib/format"
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from "../components/ui"

export function KeywordsPage() {
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [pendingId, setPendingId] = useState(null)

  const load = async () => {
    setFailed(false)
    try {
      setItems(await api.keywords())
    } catch {
      setFailed(true)
      setItems([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const add = async (e) => {
    e.preventDefault()
    const term = text.trim()
    if (!term) {
      setNotice({ tone: "error", text: "Digite uma palavra-chave antes de adicionar." })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await api.addKeyword(term)
      setText("")
      setNotice({ tone: "ok", text: `“${term}” adicionada e será buscada no próximo ciclo.` })
      load()
    } catch {
      setNotice({ tone: "error", text: "Não foi possível adicionar. Tente novamente." })
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (k) => {
    setPendingId(k.id)
    try {
      await api.toggleKeyword(k.id)
      setNotice({ tone: "ok", text: k.active ? `“${k.keyword}” pausada.` : `“${k.keyword}” reativada.` })
      load()
    } catch {
      setNotice({ tone: "error", text: "Não foi possível alterar o status. Tente novamente." })
    } finally {
      setPendingId(null)
    }
  }

  const remove = async (k) => {
    if (!window.confirm(`Remover "${k.keyword}" do monitoramento?`)) return
    setPendingId(k.id)
    try {
      await api.deleteKeyword(k.id)
      setNotice({ tone: "ok", text: `“${k.keyword}” removida.` })
      load()
    } catch {
      setNotice({ tone: "error", text: "Não foi possível remover. Tente novamente." })
    } finally {
      setPendingId(null)
    }
  }

  if (items === null) return <LoadingState label="Carregando palavras-chave…" />

  const active = items.filter((k) => k.active).length

  return (
    <Page labelledBy="page-title">
      <PageHeader
        title="Palavras-chave"
        description="O coletor busca estes termos nos marketplaces a cada ciclo. Ative, pause ou remova conforme a necessidade."
        meta={
          items.length > 0 ? (
            <span className="badge badge-info">
              {active} de {items.length} ativas
            </span>
          ) : null
        }
      />

      <section aria-label="Adicionar palavra-chave" className="card-pad">
        <form onSubmit={add} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-keyword" className="label">
              Nova palavra-chave
            </label>
            <input
              id="new-keyword"
              className="field"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: fone bluetooth, air fryer…"
              autoComplete="off"
              maxLength={80}
            />
          </div>
          <button type="submit" className="btn shrink-0" disabled={busy || !text.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
          </button>
        </form>
        {notice ? (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm font-medium ${notice.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>
            {notice.text}
          </p>
        ) : null}
      </section>

      {failed ? (
        <ErrorState title="Falha ao carregar palavras-chave" description="Tente novamente em alguns instantes." onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Nenhuma palavra-chave cadastrada"
          description="Adicione o primeiro termo acima para o coletor começar a buscar ofertas."
        />
      ) : (
        <ul aria-label="Lista de palavras-chave" className="grid gap-2 md:grid-cols-2">
          {items.map((k) => (
            <li
              key={k.id}
              className={`card flex flex-col gap-2 p-4 sm:flex-row sm:items-center ${k.active ? "" : "bg-slate-50"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <Tag className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <strong className="truncate text-sm text-slate-900" title={k.keyword}>
                    {k.keyword}
                  </strong>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`badge ${k.active ? "badge-good" : "badge-neutral"}`}>{k.active ? "Ativa" : "Pausada"}</span>
                  <span>Criada {timeago(k.created_at)}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  disabled={pendingId === k.id}
                  className="btn-secondary btn-sm min-w-[104px]"
                  aria-label={k.active ? `Pausar ${k.keyword}` : `Reativar ${k.keyword}`}
                >
                  {k.active ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                  {pendingId === k.id ? "…" : k.active ? "Pausar" : "Ativar"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(k)}
                  disabled={pendingId === k.id}
                  className="btn-danger btn-sm"
                  aria-label={`Remover ${k.keyword}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Remover</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
