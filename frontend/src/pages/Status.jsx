import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, Radio, Database, Bot, Mail, Terminal } from "lucide-react"
import { api } from "../lib/api"
import { FadeIn, CountUp } from "../components/fx"
import { timeago } from "../App"

export function StatusPage() {
  const [data, setData] = useState(null)
  useEffect(() => { api.status().then(setData).catch(() => {}) }, [])
  if (!data) return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  const { kpis, sources, events } = data

  const siteCards = [
    { id: "ml", label: "Mercado Livre" },
    { id: "amazon", label: "Amazon" },
    { id: "shopee", label: "Shopee" },
  ]

  return (
    <div className="space-y-5">
      <FadeIn><h1 className="text-xl font-bold">Status do sistema</h1></FadeIn>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { icon: Database, label: "produtos", value: kpis.total },
          { icon: Radio, label: "na watchlist", value: kpis.watch },
          { icon: Bot, label: "análises de IA", value: kpis.ai_ok },
          { icon: Bot, label: "IA Gemini", value: kpis.ai_enabled ? "sim" : "não", text: true },
          { icon: Mail, label: "e-mail", value: kpis.email_configured ? "sim" : "não", text: true },
        ].map((c, i) => (
          <FadeIn key={c.label} delay={i * 0.05}>
            <div className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
              <c.icon size={15} className="text-mut" />
              <div className="mt-1 text-2xl font-extrabold">{c.text ? c.value : <CountUp value={c.value ?? 0} />}</div>
              <div className="text-[11px] text-mut">{c.label}</div>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.1}>
        <h2 className="mb-2 text-lg font-bold">Coleta por site</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {siteCards.map((s) => {
            const info = sources[s.id]
            return (
              <div key={s.id} className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex items-center justify-between">
                  <span className={`market mkt-${s.id}`}>{s.label}</span>
                  {info?.last_ok ? (
                    <span className="badge badge-ok"><CheckCircle2 size={11} /> coletando</span>
                  ) : (
                    <span className="badge badge-warn"><XCircle size={11} /> sem coleta</span>
                  )}
                </div>
                {info?.last_ok ? (
                  <p className="mt-1.5 text-[13px] text-mut">
                    última: <b className="text-white">{timeago(info.last_ok)}</b>
                    {info.errors_24h > 0 && <> · <span className="text-accent-soft">{info.errors_24h} erro(s)/24h</span></>}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13px] text-mut">nenhuma coleta bem-sucedida ainda.</p>
                )}
              </div>
            )
          })}
        </div>
      </FadeIn>

      <FadeIn delay={0.15}>
        <h2 className="mb-2 flex items-center gap-1.5 text-lg font-bold"><Terminal size={17} /> Eventos recentes</h2>
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
          <table className="w-full text-[13px]">
            <tbody>
              {events.map((e, i) => (
                <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                           transition={{ delay: Math.min(i * 0.03, 0.4) }}
                           className="border-b border-ink-700/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-mut">{timeago(e.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${e.level === "info" ? "badge-ok" : e.level === "warn" ? "badge-warn" : "badge-danger"}`}>{e.level}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-mut">{e.scope}</td>
                  <td className="px-3 py-2">{e.message.slice(0, 140)}</td>
                </motion.tr>
              ))}
              {events.length === 0 && <tr><td className="px-3 py-6 text-center text-mut" colSpan={4}>sem eventos</td></tr>}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </div>
  )
}
