import { useState } from "react"
import { motion } from "framer-motion"
import { Flame, Loader2, ShieldAlert } from "lucide-react"
import { api } from "../lib/api"
import { ShinyText } from "../components/fx"

export function LoginPage({ onOk }) {
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(false)
    try {
      await api.login(user, pass)
      onOk()
    } catch {
      setError(true)
    } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-[75vh] place-items-center">
      <motion.form onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm space-y-3 rounded-2xl border border-ink-700 bg-ink-850 p-8 shadow-2xl">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-soft shadow-lg shadow-accent/30">
          <Flame size={22} className="text-white" />
        </div>
        <h1 className="text-center text-2xl font-extrabold"><ShinyText>Promobot</ShinyText></h1>
        <p className="-mt-2 text-center text-sm text-mut">Painel de promoções — acesso restrito</p>
        {error && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-1.5 text-sm text-accent-soft">
            <ShieldAlert size={14} /> usuário ou senha incorretos
          </motion.p>
        )}
        <input className="field" placeholder="Usuário" value={user} onChange={(e) => setUser(e.currentTarget.value)} autoFocus />
        <input className="field" type="password" placeholder="Senha" value={pass} onChange={(e) => setPass(e.currentTarget.value)} />
        <button className="btn w-full" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Entrar"}
        </button>
      </motion.form>
    </div>
  )
}
