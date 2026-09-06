// Componentes compartilhados do site público (vitrine).
import { useEffect, useState } from "react"
import { Link, NavLink, useNavigate, useOutletContext } from "react-router-dom"
import { ExternalLink, Heart, Search } from "lucide-react"
import { BrandMark } from "../components/BrandMark"
import { DiscountBadge, MarketBadge, ProductImage, ScoreBadge } from "../components/ui"
import { brl, timeago } from "../lib/format"
import { site } from "../lib/api"

export function useSiteContext() {
  return useOutletContext()
}

export function useDocTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Promobot` : "Promobot — Ofertas e promoções"
  }, [title])
}

function ConsentBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem("pb_cookie_consent")) setShow(true)
    } catch {
      setShow(true)
    }
  }, [])
  if (!show) return null
  const choose = (v) => {
    try {
      localStorage.setItem("pb_cookie_consent", v)
    } catch {
      /* sem armazenamento: só dispensa */
    }
    setShow(false)
  }
  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="card-pad mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-slate-600">
          Usamos cookies para manter sua sessão e lembrar preferências. Veja a{" "}
          <Link to="/privacidade" className="font-semibold text-brand-700 underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => choose("essential")}>
            Só essenciais
          </button>
          <button type="button" className="btn btn-sm" onClick={() => choose("accepted")}>
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}

function SiteNav({ me }) {
  const [q, setQ] = useState("")
  const navigate = useNavigate()
  const submit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    navigate(`/?${params.toString()}`)
  }
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="Promobot — início">
          <BrandMark size={32} className="h-8 w-8" alt="PromoBot" />
          <span className="text-base font-bold tracking-tight text-slate-900">Promobot</span>
        </Link>
        <nav aria-label="Seções do site" className="ml-2 hidden items-center gap-1 md:flex">
          {[
            ["Ofertas", "/"],
            ["Cupons", "/cupons"],
            ["Lojas", "/lojas"],
          ].map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <form onSubmit={submit} role="search" aria-label="Buscar ofertas" className="ml-auto min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="site-search" className="sr-only">
            Buscar oferta
          </label>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="site-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar oferta…"
              className="field pl-9"
              autoComplete="off"
            />
          </span>
        </form>
        {me?.logged ? (
          <Link to="/conta" className="btn-secondary btn-sm shrink-0" title={me.user?.email || "Minha conta"}>
            {me.user?.avatar_url ? (
              <img src={me.user.avatar_url} alt="" className="h-5 w-5 rounded-full" referrerPolicy="no-referrer" />
            ) : null}
            <span className="max-w-[90px] truncate">{me.user?.name?.split(" ")[0] || "Conta"}</span>
          </Link>
        ) : (
          <Link to="/entrar" className="btn btn-sm shrink-0">
            Entrar
          </Link>
        )}
      </div>
      <nav aria-label="Seções do site (mobile)" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 md:hidden">
        {[
          ["Ofertas", "/"],
          ["Cupons", "/cupons"],
          ["Lojas", "/lojas"],
          ["Favoritos", "/favoritos"],
        ].map(([label, to]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

export function SiteShell({ me, disclosure, children }) {
  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <SiteNav me={me} />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-5 outline-none sm:px-6 sm:py-6">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-slate-500 sm:px-6">
          {disclosure ? <p className="max-w-3xl text-xs leading-relaxed">{disclosure}</p> : null}
          <p className="text-xs">
            Preços coletados automaticamente e sujeitos a alteração na loja. A compra é concluída no site da loja.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
            <Link to="/privacidade" className="hover:text-slate-800 hover:underline">
              Privacidade
            </Link>
            <Link to="/termos" className="hover:text-slate-800 hover:underline">
              Termos
            </Link>
            <a href="/sitemap.xml" className="hover:text-slate-800 hover:underline">
              Sitemap
            </a>
          </p>
        </div>
      </footer>
      <ConsentBanner />
    </div>
  )
}

export function SiteOfferCard({ item, isFav, onToggleFav, favBusy }) {
  const { product: p, offer: o, analysis: a, market_label } = item
  return (
    <article className="card flex h-full flex-col overflow-hidden" aria-labelledby={`site-offer-${p.id}`}>
      <Link to={`/produto/${p.id}`} tabIndex={-1} aria-hidden="true" className="block border-b border-slate-100">
        <ProductImage src={p.image_url} alt="" className="h-44 w-full" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <MarketBadge code={p.marketplace} label={market_label} />
          {a?.is_hist_min ? <span className="badge badge-good">Mínima histórica</span> : null}
          <span className="ml-auto text-xs text-slate-400">{timeago(o.updated_at)}</span>
        </div>
        <h2 id={`site-offer-${p.id}`} className="line-clamp-2 min-h-[2.6em] text-sm font-semibold leading-snug text-slate-900">
          <Link to={`/produto/${p.id}`} className="hover:text-blue-800 hover:underline">
            {p.title}
          </Link>
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-xl font-bold tracking-tight text-slate-900">{brl(o.price)}</p>
          {o.list_price > o.price ? <s className="text-xs text-slate-400">{brl(o.list_price)}</s> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DiscountBadge value={a?.real_discount_pct} />
          <ScoreBadge score={a?.score} />
          {o.coupon_text ? (
            <span className="badge border-dashed border-brand-300 bg-brand-50 font-bold text-brand-800">{o.coupon_text}</span>
          ) : null}
        </div>
        <div className="mt-auto grid grid-cols-[1fr_auto] gap-1.5 pt-2">
          <a
            href={`/r/${p.id}?src=card`}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="btn w-full btn-sm"
            aria-label={`Ver oferta de ${p.title.slice(0, 60)} na loja`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver oferta
          </a>
          <button
            type="button"
            onClick={() => onToggleFav?.(p.id, Boolean(isFav))}
            disabled={favBusy || !onToggleFav}
            title={isFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
            aria-pressed={Boolean(isFav)}
            aria-label={isFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
            className={`btn-secondary btn-sm !px-2.5 ${isFav ? "!border-red-200 !bg-red-50 !text-red-700" : ""}`}
          >
            <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} aria-hidden="true" />
          </button>
          {item.affiliate ? (
            <p className="col-span-2 text-center text-[10.5px] text-slate-400">link de afiliado</p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
