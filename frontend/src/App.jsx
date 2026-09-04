import { useCallback, useEffect, useRef, useState } from "react"
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import {
  ChartNoAxesColumn,
  Eye,
  Flame,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  X,
  Zap,
} from "lucide-react"
import { api } from "./lib/api"
import { timeago } from "./lib/format"
import { FeedPage } from "./pages/Feed"
import { ProductPage } from "./pages/Product"
import { WatchlistPage } from "./pages/Watchlist"
import { KeywordsPage } from "./pages/Keywords"
import { StatusPage } from "./pages/Status"
import { LoginPage } from "./pages/Login"
import { InsightsPage } from "./pages/Insights"

const NAV = [
  { to: "/", label: "Ofertas", icon: Flame, end: true },
  { to: "/watchlist", label: "Monitoradas", icon: Eye, end: false },
  { to: "/keywords", label: "Palavras-chave", icon: Tag, end: false },
  { to: "/insights", label: "Insights", icon: Sparkles, end: false },
  { to: "/status", label: "Status", icon: ChartNoAxesColumn, end: false },
]

function useCollector() {
  const [cloud, setCloud] = useState(null)
  const [runUrl, setRunUrl] = useState(null)
  const collecting = cloud === "fila" || cloud === "rodando"

  const poll = useCallback(async () => {
    try {
      const st = await api.cycleStatus()
      setRunUrl(st.url || null)
      if (st.running) {
        setCloud(st.state === "queued" || st.state === "waiting" || st.state === "pending" ? "fila" : "rodando")
      } else if (st.state === "concluido_recente") {
        setCloud("concluido")
        window.setTimeout(() => setCloud(null), 12000)
        window.dispatchEvent(new CustomEvent("promobot:refresh"))
      } else {
        setCloud((prev) => (prev === "concluido" ? prev : null))
      }
    } catch {
      /* coleta indisponível: mantém estado anterior */
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [poll])

  const trigger = useCallback(async () => {
    if (collecting) return
    setCloud("rodando")
    try {
      const r = await api.collectNow()
      if (r?.already) setCloud("fila")
    } catch {
      /* o polling corrige o estado */
    }
    poll()
  }, [collecting, poll])

  return { cloud, collecting, runUrl, trigger }
}

function CollectorStatus({ collecting, cloud }) {
  if (collecting) {
    return (
      <span className="badge badge-warn" role="status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {cloud === "fila" ? "Coleta na fila" : "Coletando"}
      </span>
    )
  }
  if (cloud === "concluido") {
    return (
      <span className="badge badge-good" role="status">
        Coleta concluída
      </span>
    )
  }
  return (
    <span className="badge badge-neutral" role="status">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
      Coletor pronto
    </span>
  )
}

function SidebarNav({ onNavigate }) {
  return (
    <nav aria-label="Navegação principal" className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span>{label}</span>
              {isActive ? <span className="sr-only">(página atual)</span> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Shell({ onLogout, collector }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const location = useLocation()
  const closeRef = useRef(null)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (menuOpen) closeRef.current?.focus()
  }, [menuOpen])

  const submitSearch = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    navigate(`/?${params.toString()}`)
    setMenuOpen(false)
  }

  const { collecting, cloud, trigger } = collector

  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6" aria-label="Promobot — início">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-white">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[17px] font-bold leading-none tracking-tight text-slate-900">Promobot</span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Inteligência de preços
            </span>
          </span>
        </Link>
        <div className="flex-1 space-y-4 overflow-y-auto px-3">
          <SidebarNav />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">Coleta de ofertas</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">Ciclo automático a cada 30 min nos 3 marketplaces.</p>
            <button type="button" onClick={trigger} disabled={collecting} className="btn mt-2.5 w-full btn-sm">
              {collecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {cloud === "fila" ? "Na fila…" : "Coletando…"}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  Buscar agora
                </>
              )}
            </button>
          </div>
        </div>
        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
            tabIndex={-1}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-white">
                  <Flame className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-base font-bold text-slate-900">Promobot</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-4">
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
              <button type="button" onClick={trigger} disabled={collecting} className="btn w-full">
                {collecting ? "Coletando…" : "Buscar agora"}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-60">
        {/* Topbar contextual */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu de navegação"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <form onSubmit={submitSearch} role="search" aria-label="Buscar no catálogo" className="min-w-0 flex-1 sm:max-w-sm">
              <label htmlFor="topbar-search" className="sr-only">
                Buscar produto
              </label>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="topbar-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar produto…"
                  className="field pl-9"
                  autoComplete="off"
                />
              </span>
            </form>
            <div className="ml-auto flex items-center gap-2">
              <CollectorStatus collecting={collecting} cloud={cloud} />
              <button
                type="button"
                onClick={trigger}
                disabled={collecting}
                className="btn-secondary btn-sm hidden sm:inline-flex"
                title="Iniciar coleta agora"
              >
                {collecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Atualizar
              </button>
            </div>
          </div>
          {collecting || cloud === "concluido" ? (
            <div
              role="status"
              className={`border-t px-4 py-1.5 text-center text-xs font-medium sm:px-6 ${
                cloud === "concluido" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {cloud === "concluido"
                ? "Coleta concluída. Os dados foram atualizados."
                : cloud === "fila"
                  ? "Coleta na fila. O painel será atualizado automaticamente."
                  : "Coletando ofertas nos marketplaces. O painel será atualizado automaticamente."}
            </div>
          ) : null}
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-5 outline-none sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)
  const collector = useCollector()

  useEffect(() => {
    const h = () => window.location.reload()
    window.addEventListener("promobot:refresh", h)
    return () => window.removeEventListener("promobot:refresh", h)
  }, [])

  useEffect(() => {
    api
      .me()
      .then((d) => setAuth(d.logged !== false))
      .catch(() => setAuth(false))
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* mesmo sem resposta, encerra a sessão local */
    }
    setAuth(false)
    window.location.href = "/login"
  }, [])

  if (auth === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100" role="status" aria-label="Carregando">
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-blue-700" aria-hidden="true" />
          Carregando painel…
        </span>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onOk={() => setAuth(true)} standalone={!auth} />} />
      {auth ? (
        <Route element={<Shell onLogout={logout} collector={collector} />}>
          <Route index element={<FeedPage />} />
          <Route path="produto/:id" element={<ProductPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="keywords" element={<KeywordsPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      ) : (
        <Route path="*" element={<LoginPage onOk={() => setAuth(true)} standalone />} />
      )}
    </Routes>
  )
}

export { timeago }
