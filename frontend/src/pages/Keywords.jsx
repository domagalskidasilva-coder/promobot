import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Tag, Plus, Trash2, Pause, Play, Loader2 } from "lucide-react"
import { api } from "../lib/api"
import { FadeIn } from "../components/fx"
import { timeago } from "../App"

export function KeywordsPage() {
  const [items, setItems] = useState(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  const load = () => api.keywords().then(setItems).catch(() => setItems([]))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { await api.addKeyword(text.trim()); setText(""); await load() } finally { setBusy(false) }
  }

  if (!items) return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>

  return (
    <div className="space-y-4">
      <FadeIn>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Tag className="text-accent-soft" size={20} /> Palavras-chave monitoradas</h1>
        <p className="text-sm text-mut">O bot busca esses termos em todos os sites a cada ciclo — no Mercado Livre via Chrome real (ClockBrowser).</p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex gap-2">
          <input className="field max-w-md" placeholder="ex.: rtx 4070, steam deck oled…"
                 value={text} onChange={(e) => setText(e.currentTarget.value)}
                 onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn" onClick={add} disabled={busy || !text.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} adicionar
          </button>
        </div>
      </FadeIn>

      <div className="space-y-2">
        <AnimatePresence>
          {items.map((k, i) => (
            <motion.div key={k.id} layout
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
              className={`flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-850 px-4 py-2.5 ${k.active ? "" : "opacity-50"}`}
            >
              <Tag size={14} className="text-mut" />
              <b className="flex-1 text-sm">{k.keyword}</b>
              <span className="text-[11px] text-mut">criada {timeago(k.created_at)}</span>
              <button className={`btn btn-sm ${k.active ? "btn-ok" : "btn-ghost"}`}
                      onClick={async () => { await api.toggleKeyword(k.id); load() }}>
                {k.active ? <><Pause size={12} /> ativa</> : <><Play size={12} /> pausada</>}
              </button>
              <button className="btn btn-danger btn-sm"
                      onClick={async () => { await api.deleteKeyword(k.id); load() }}>
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <FadeIn><p className="py-10 text-center text-sm text-mut">Nenhuma palavra-chave ainda.</p></FadeIn>
        )}
      </div>
    </div>
  )
}
