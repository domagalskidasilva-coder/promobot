import { useState } from "react"
import { Flame, Loader2 } from "lucide-react"
import { api } from "../lib/api"

export function LoginPage({ onOk, standalone = true }) {
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!user.trim() || !pass) {
      setError(true)
      return
    }
    setBusy(true)
    setError(false)
    try {
      await api.login(user.trim(), pass)
      onOk()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`grid place-items-center px-4 ${standalone ? "min-h-screen bg-slate-100" : "min-h-[60vh]"}`}>
      <main aria-labelledby="login-title" className="w-full max-w-sm">
        <form onSubmit={submit} className="card-pad space-y-3" noValidate={false}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-700 text-white" aria-hidden="true">
              <Flame className="h-5 w-5" />
            </span>
            <span>
              <span id="login-title" className="block text-lg font-bold tracking-tight text-slate-900">
                Promobot
              </span>
              <span className="block text-xs font-medium text-slate-500">Inteligência de preços</span>
            </span>
          </div>
          <p className="text-sm text-slate-600">Acesso restrito ao painel de monitoramento.</p>
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              Usuário ou senha incorretos. Verifique e tente novamente.
            </p>
          ) : null}
          <div>
            <label htmlFor="login-user" className="label">
              Usuário
            </label>
            <input
              id="login-user"
              className="field"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="login-pass" className="label">
              Senha
            </label>
            <input
              id="login-pass"
              className="field"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Verificando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-slate-400">As credenciais são verificadas no servidor a cada acesso.</p>
      </main>
    </div>
  )
}
