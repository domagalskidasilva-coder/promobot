import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Store as StoreIcon, Plus, Trash2, Pause, Play, Loader2, ExternalLink } from "lucide-react"
import { api } from "../lib/api"
import { timeago } from "../lib/format"
import { EmptyState, LoadingState, Page, PageHeader } from "../components/ui"

export function StoresPage() {
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const load = async () => {
    setFailed(false)
    try { setItems(await api.stores()) } catch { setFailed(true) }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true); setErr("")
    try {
      await api.addStore({ name: name.trim(), url: url.trim(), query: url.trim() || name.trim() })
      setName(""); setUrl(""); await load()
    } catch {
      setErr("não foi possível adicionar — informe URL ou nome (e confira se já não está cadastrada)")
    } finally { setBusy(false) }
  }

  if (items === null) return failed ? <LoadingState /> : <LoadingState />

  return (
    <Page>
      <PageHeader
        icon={<StoreIcon size={20} className="text-accent-soft" />}
        title="Lojas monitoradas"
        subtitle="Cadastre lojas do Mercado Livre, Amazon ou Shopee — o bot varre os produtos de cada loja a cada ciclo, junto com as palavras-chave."
      />

      <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex flex-wrap gap-2">
          <input className="field min-w-[220px] flex-1" placeholder="Nome da loja (ex.: Official Store Samsung)"
                 value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <input className="field min-w-[280px] flex-[2]" placeholder="URL da loja (opcional, recomendado — melhora a precisão)"
                 value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
          <button className="btn" onClick={add} disabled={busy || !name.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} adicionar
          </button>
        </div>
        {err && <p className="text-sm text-accent-soft">{err}</p>}
        {url.trim() && (
          <p className="text-[12px] text-mut">
            marketplace detectado automaticamente a partir da URL; se for loja física, fica como referência.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {items.map((s, i) => (
            <motion.div key={s.id} layout
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
              className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-850 px-4 py-3 ${s.active ? "" : "opacity-50"}`}>
              <StoreIcon size={15} className="text-mut" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm text-white/90">{s.name}</b>
                <small className="text-[11px] text-mut">
                  {s.marketplace.toUpperCase()} · cadastrada {timeago(s.created_at)}
                  {s.url && <> · <a href={s.url} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 hover:text-white"><ExternalLink size={10} /> abrir loja</a></>}
                </small>
              </div>
              <button className={`btn btn-sm ${s.active ? "btn-ok" : "btn-ghost"}`}
                      onClick={async () => { await api.toggleStore(s.id); load() }}>
                {s.active ? <><Pause size={12} /> ativa</> : <><Play size={12} /> pausada</>}
              </button>
              <button className="btn btn-danger btn-sm"
                      onClick={async () => { await api.deleteStore(s.id); load() }}>
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <EmptyState message="Nenhuma loja cadastrada — adicione a primeira acima." />
        )}
      </div>
    </Page>
  )
}
