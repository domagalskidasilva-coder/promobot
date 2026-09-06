import { useEffect, useState } from "react"
import { Globe, Loader2, Save } from "lucide-react"
import { api } from "../lib/api"
import { EmptyState, LoadingState, Page, PageHeader } from "../components/ui"

const FIELDS = [
  { key: "site_title", label: "Título da vitrine", hint: "Ex.: Ofertas do França. Aparece no topo da página inicial.", placeholder: "Ofertas selecionadas" },
  { key: "site_tagline", label: "Subtítulo", hint: "Uma linha abaixo do título.", placeholder: "Preços comparados com o histórico real…" },
  { key: "hero_text", label: "Texto do banner", hint: "Opcional. Se vazio, usa o subtítulo.", placeholder: "" },
  { key: "whatsapp_url", label: "URL do canal de ofertas", hint: "Ex.: https://whatsapp.com/channel/.... Vazio = esconde o botão.", placeholder: "https://…" },
  { key: "affiliate_disclosure", label: "Aviso de afiliado", hint: "Exibido no rodapé, na privacidade e nos termos. Exigido pelos programas de afiliados.", placeholder: "Links deste site podem gerar comissão…" },
  { key: "cookie_text", label: "Texto do banner de cookies (reservado)", hint: "Reservado para personalização futura do banner.", placeholder: "" },
]

export function SiteSettingsPage() {
  const [cfg, setCfg] = useState(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.siteSettings().then(setCfg).catch(() => setFailed(true)) }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.saveSiteSettings(cfg)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (cfg === null) {
    return failed ? (
      <EmptyState icon={Globe} title="Falha ao carregar" description="Tente novamente." />
    ) : (
      <LoadingState label="Carregando configurações…" />
    )
  }

  return (
    <Page>
      <PageHeader
        title="Site público"
        description="Textos da vitrine em / (mesmo mecanismo da página Afiliados: salva no banco, vale na hora, sem redeploy)."
      />
      <div className="card-pad space-y-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-800">{f.label}</span>
            {f.key === "affiliate_disclosure" ? (
              <textarea
                className="field min-h-[80px]"
                placeholder={f.placeholder}
                value={cfg[f.key] || ""}
                onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
              />
            ) : (
              <input
                className="field"
                placeholder={f.placeholder}
                value={cfg[f.key] || ""}
                onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
              />
            )}
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
    </Page>
  )
}
