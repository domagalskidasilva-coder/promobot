import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, MessageCircle, QrCode, RefreshCw, Save, Send, Users } from "lucide-react"
import { api } from "../lib/api"
import { timeago } from "../lib/format"
import { EmptyState, LoadingState, Page, PageHeader } from "../components/ui"

const STATE_LABEL = {
  open: { text: "Conectado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  connecting: { text: "Conectando…", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  close: { text: "Desconectado", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  unreachable: { text: "Evolution API inalcançável", cls: "bg-red-50 text-red-700 border-red-200" },
  unknown: { text: "Estado desconhecido", cls: "bg-slate-100 text-slate-600 border-slate-200" },
}

const FIELDS = [
  { key: "wa_pairing_phone", label: "Número do bot (para parear)",
    hint: "Só dígitos com DDI, ex.: 5511999998888. Gera um código de 8 dígitos para digitar no celular — mais confiável que o QR." },
  { key: "wa_send_times", label: "Horários de post",
    hint: "Separados por vírgula, fuso de Brasília. Ex.: 09:00,13:00,19:00" },
  { key: "wa_max_per_post", label: "Ofertas por post",
    hint: "Quantas promoções por mensagem em lote (1 a 5 recomendado)." },
]

export function WhatsAppPage() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [actionBusy, setActionBusy] = useState(null) // 'qr' | 'groups' | 'test' | 'state'
  const [qr, setQr] = useState(null)
  const [pairingCode, setPairingCode] = useState(null)
  const [groups, setGroups] = useState(null)
  const [actionError, setActionError] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(() => {
    api.waConfig().then(setData).catch(() => setFailed(true))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const runAction = async (action) => {
    setActionBusy(action)
    setActionError(null)
    if (action === "qr") { setQr(null); setPairingCode(null) }
    try {
      const res = await api.waAction(action)
      if (res.pending) {
        // Vercel → VPS: consulta o resultado até chegar (máx. 40s)
        const ts = res.ts
        let attempt = 0
        const poll = async () => {
          attempt += 1
          const r = await api.waResult(ts)
          if (r.pending && attempt < 14) { pollRef.current = setTimeout(poll, 3000); return }
          applyResult(action, r)
        }
        await poll()
      } else {
        applyResult(action, res)
      }
    } catch {
      setActionError("não foi possível executar a ação — tente novamente")
      setActionBusy(null)
    }
  }

  const applyResult = (action, res) => {
    setActionBusy(null)
    if (res?.error) { setActionError(res.error); return }
    if (action === "qr") {
      setQr(res.qr || null)
      setPairingCode(res.pairing_code || null)
      if (res.qr || res.pairing_code) setActionError(null)
    }
    if (action === "groups") setGroups(res.groups || [])
    if (action === "state" || action === "qr") load()
  }

  const save = async (extra = {}) => {
    setSaving(true)
    try {
      await api.waSave({ ...data.settings, ...extra })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      load()
    } finally { setSaving(false) }
  }

  const pickGroup = (jid) => {
    setData((d) => ({ ...d, settings: { ...d.settings, wa_group_jid: jid } }))
    save({ wa_group_jid: jid })
  }

  if (data === null) return failed ? (
    <EmptyState icon={MessageCircle} title="WhatsApp indisponível"
      description="Não foi possível ler a configuração agora. Recarregue a página." />
  ) : <LoadingState label="Carregando integração…" />

  const st = STATE_LABEL[data.state] || STATE_LABEL.unknown
  const s = data.settings

  return (
    <Page>
      <PageHeader
        title="WhatsApp automático"
        description="Posta as melhores oportunidades no grupo PROMO$ DO FRANÇA nos horários configurados, com link de afiliado e anti-spam."
        meta={
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${st.cls}`}>
            <span className={`h-2 w-2 rounded-full ${data.state === "open" ? "bg-emerald-500" : "bg-slate-400"}`} />
            {st.text}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conexão */}
        <section aria-label="Conexão" className="card-pad space-y-3">
          <h2 className="section-title">Conexão</h2>
          <p className="text-sm text-slate-600">
            Preencha o <b>Número do bot</b> abaixo, salve, e gere o <b>código de pareamento</b> — digite
            no celular (WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone).
            Prefira um chip extra — não o seu número principal.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => runAction("qr")} disabled={actionBusy !== null}>
              {actionBusy === "qr" ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />} gerar QR / código
            </button>
            <button className="btn-secondary btn-sm" onClick={() => { setQr(null); runAction("state") }} disabled={actionBusy !== null}>
              <RefreshCw size={14} /> atualizar estado
            </button>
            <button className="btn-secondary btn-sm" onClick={() => runAction("groups")} disabled={actionBusy !== null}>
              {actionBusy === "groups" ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} listar grupos
            </button>
          </div>
          {qr ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                   alt="QR de pareamento do WhatsApp" className="h-56 w-56" />
              <small className="text-xs text-slate-500">QR novo — escaneie nos próximos 30 segundos (depois clique em mostrar QR de novo)</small>
            </div>
          ) : null}
          {pairingCode ? (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Código de pareamento</span>
              <code className="font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900">{pairingCode}</code>
              <small className="text-center text-xs text-emerald-800">
                No celular do bot: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone
              </small>
            </div>
          ) : null}
          {groups ? (
            groups.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum grupo encontrado — adicione o número do bot ao grupo e liste de novo.</p>
            ) : (
              <div className="space-y-1.5">
                <small className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupo de destino</small>
                {groups.slice(0, 12).map((g) => (
                  <button key={g.id} onClick={() => pickGroup(g.id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${s.wa_group_jid === g.id ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 hover:bg-slate-50"}`}>
                    <span className="truncate">{g.subject}</span>
                    {s.wa_group_jid === g.id && <span className="text-xs">selecionado</span>}
                  </button>
                ))}
              </div>
            )
          ) : null}
          {actionError ? <p className="text-sm font-medium text-red-700">{actionError}</p> : null}
        </section>

        {/* Agendamento */}
        <section aria-label="Agendamento e anti-spam" className="card-pad space-y-4">
          <h2 className="section-title">Agendamento</h2>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input type="checkbox" checked={s.wa_enabled === "true"}
                   onChange={(e) => { const v = e.currentTarget.checked ? "true" : "false"; setData((d) => ({ ...d, settings: { ...d.settings, wa_enabled: v } })); save({ wa_enabled: v }) }}
                   className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
            Postagem automática {s.wa_enabled === "true" ? "ligada" : "desligada"}
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-800">{f.label}</span>
              <input className="field" value={s[f.key] || ""}
                     onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, [f.key]: e.currentTarget.value } }))} />
              <small className="mt-1 block text-xs text-slate-500">{f.hint}</small>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button className="btn" onClick={() => save()} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} salvar
            </button>
            {saved && <span className="text-sm font-semibold text-emerald-700">salvo</span>}
          </div>
          <dl className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-sm">
            <div><dt className="text-xs text-slate-500">Mensagens hoje</dt>
              <dd className="font-bold text-slate-900">{data.posts_today} / {data.daily_cap}</dd></div>
            <div><dt className="text-xs text-slate-500">Último post</dt>
              <dd className="font-bold text-slate-900">{data.last_post ? timeago(data.last_post) : "—"}</dd></div>
          </dl>
          <button className="btn-secondary btn-sm" onClick={() => runAction("test")} disabled={actionBusy !== null}>
            {actionBusy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} enviar teste no grupo
          </button>
          {data.last_result?.error ? (
            <p className="text-sm font-medium text-red-700">último erro: {data.last_result.error}</p>
          ) : null}
        </section>
      </div>

      <div className="card-pad">
        <h2 className="section-title">Como funciona</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>• A cada ciclo, as ofertas novas com desconto real, mínima histórica ou cupom entram na fila.</li>
          <li>• Nos horários configurados, o bot posta as melhores no grupo — cada produto só repete depois de esgotar a fila (nunca em 72 h).</li>
          <li>• Anti-spam: teto diário de {data.daily_cap} mensagens e ritmo humano entre envios.</li>
          <li>• A mensagem usa o mesmo modelo do botão "copiar WhatsApp" — marca e link do canal no rodapé.</li>
          <li>• A Evolution API roda na VPS junto com o Promobot, sem exposição pública. <a className="text-brand-700 underline" href="https://doc.evolution-api.com/" target="_blank" rel="noopener noreferrer">docs <ExternalLink className="inline h-3 w-3" /></a></li>
        </ul>
      </div>
    </Page>
  )
}
