// Entrada do site público (login social Google).
import { useEffect, useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { LogIn } from "lucide-react"
import { site } from "../lib/api"
import { BrandMark } from "../components/BrandMark"
import { LoadingState } from "../components/ui"
import { useDocTitle } from "./components"

const ERROS = {
  estado: "A sessão expirou no meio do login. Tente de novo.",
  token: "O Google não validou o login. Tente de novo.",
  perfil: "Não conseguimos ler seu perfil do Google. Tente de novo.",
  rede: "Falha de rede ao falar com o Google. Tente de novo.",
}

export function SiteLogin({ me }) {
  useDocTitle("Entrar")
  const [params] = useSearchParams()
  const [google, setGoogle] = useState(null)
  const next = params.get("next") || "/"
  const erro = params.get("erro")

  useEffect(() => {
    site.me().then((d) => setGoogle(d.google_enabled)).catch(() => setGoogle(false))
  }, [])

  if (me?.logged) return <Navigate to={next.startsWith("/") ? next : "/"} replace />
  if (me === null || google === null) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <LoadingState label="Verificando sessão…" />
      </div>
    )
  }

  return (
    <div className="grid place-items-center px-4 py-10">
      <main aria-labelledby="site-login-title" className="w-full max-w-sm">
        <div className="card-pad space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={40} className="h-10 w-10" alt="PromoBot" />
            <span>
              <span id="site-login-title" className="block text-lg font-bold tracking-tight text-slate-900">
                Entrar
              </span>
              <span className="block text-xs font-medium text-slate-500">Favoritos e alertas de preço</span>
            </span>
          </div>
          {erro ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {ERROS[erro] || "Falha no login. Tente de novo."}
            </p>
          ) : null}
          {google ? (
            <a href={site.googleStart(next)} className="btn w-full">
              <LogIn className="h-4 w-4" aria-hidden="true" /> Entrar com Google
            </a>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Login social em configuração. A vitrine continua aberta sem conta.
            </p>
          )}
          <p className="text-xs leading-relaxed text-slate-500">
            Ao entrar você concorda com os <Link to="/termos" className="underline">Termos</Link> e a{" "}
            <Link to="/privacidade" className="underline">Privacidade</Link>. Usamos seu e-mail só para os alertas que você criar.
          </p>
          <Link to="/" className="btn-secondary w-full">
            Continuar sem entrar
          </Link>
        </div>
      </main>
    </div>
  )
}
