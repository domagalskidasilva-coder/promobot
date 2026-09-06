import { useEffect, useState } from "react"
import { HandCoins, Loader2, Save, ExternalLink } from "lucide-react"
import { api } from "../lib/api"
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from "../components/ui"

const FIELDS = [
  { key: "affiliate_amazon_tag", label: "Amazon — tag de associado",
    hint: "associados.amazon.com.br → o ID tipo \"minhaloja-20\". Todo link da Amazon sai com ?tag=seu-id.",
    placeholder: "minhaloja-20" },
  { key: "affiliate_ml_matt_word", label: "Mercado Livre — matt_word",
    hint: "Meli Afiliados → o identificador que aparece nos links gerados lá. Todo link do ML sai com ?matt_word=valor.",
    placeholder: "seu-id-meli" },
  { key: "affiliate_ml_matt_tool", label: "Mercado Livre — matt_tool (opcional)",
    hint: "Código de ferramenta do Meli Afiliados (opcional).",
    placeholder: "12345678" },
]

export function AffiliatePage() {
  const [cfg, setCfg] = useState(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.affiliateConfig().then(setCfg).catch(() => setFailed(true)) }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.saveAffiliateConfig(cfg)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  if (cfg === null) return failed ? <ErrorState /> : <LoadingState />
  const anyOn = FIELDS.some((f) => (cfg[f.key] || "").trim() !== "")

  return (
    <Page>
      <PageHeader
        title="Links de afiliado"
        description="Transformação automática: o banco guarda o link canônico e a conversão acontece na entrega. Vazio = desligado (links originais)."
      />

      <div className="card-pad space-y-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-800">{f.label}</span>
            <input className="field" placeholder={f.placeholder}
                   value={cfg[f.key] || ""}
                   onChange={(e) => setCfg({ ...cfg, [f.key]: e.currentTarget.value })} />
            <small className="mt-1 block text-xs text-slate-500">{f.hint}</small>
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} salvar
          </button>
          {saved && <span className="text-sm font-semibold text-emerald-700">salvo</span>}
        </div>
      </div>

      <div className="card-pad">
        <h2 className="section-title">Como funciona</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>• O link de afiliado é gerado <b>na hora da entrega</b> (API/painel), sem alterar o banco.</li>
          <li>• Feed, página do produto, cupons e watchlist entregam links com sua tag automaticamente.</li>
          <li>• Cards com <b>“link de afiliado”</b> indicam que o link saiu com sua tag.</li>
          <li>• Programas: <a className="text-brand-700 underline" href="https://associados.amazon.com.br/" target="_blank" rel="noopener noreferrer">Amazon Associados <ExternalLink className="inline h-3 w-3" /></a> · <a className="text-brand-700 underline" href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noopener noreferrer">Meli Afiliados <ExternalLink className="inline h-3 w-3" /></a></li>
        </ul>
        {!anyOn && <p className="mt-2 text-xs text-slate-500">Nenhum ID configurado ainda — os links estão originais.</p>}
      </div>
    </Page>
  )
}
