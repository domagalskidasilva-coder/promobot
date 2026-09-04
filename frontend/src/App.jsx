import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Flame, Eye, Tag, ChartNoAxesColumn, RefreshCw, Loader2, Zap, ShieldCheck, Clock3, Sparkles, Search } from "lucide-react"
import { api } from "./lib/api"
import { Routes, Route, Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { FeedPage } from "./pages/Feed"
import { ProductPage } from "./pages/Product"
import { WatchlistPage } from "./pages/Watchlist"
import { KeywordsPage } from "./pages/Keywords"
import { StatusPage } from "./pages/Status"
import { InsightsPage } from "./pages/Insights"
import { LoginPage } from "./pages/Login"

function timeago(iso) {
  if (!iso) return "—"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

/* ---------------- Sidebar (desktop-first) ---------------- */
function Sidebar() {
  const [collecting, setCollecting] = useState(false)
  const navigate = useNavigate()

  const collect = async () => {
    if (collecting) return
    setCollecting(true)
    try { await api.collectNow() } catch {}
    const poll = setInterval(async () => {
      try {
        const st = await api.cycleStatus()
        if (!st.running) { clearInterval(poll); setCollecting(false); navigate("/?refresh=" + Date.now()) }
      } catch { clearInterval(poll); setCollecting(false) }
    }, 8000)
    setTimeout(() => { clearInterval(poll); setCollecting(false); navigate("/?refresh=" + Date.now()) }, 240000)
  }

  const links = [
    { to: "/", label: "Ofertas", icon: Flame },
    { to: "/watchlist", label: "Watchlist", icon: Eye },
    { to: "/keywords", label: "Palavras-chave", icon: Tag },
    { to: "/insights", label: "Insights", icon: Sparkles },
    { to: "/status", label: "Status", icon: ChartNoAxesColumn },
  ]

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-white/[0.06] bg-ink-950/70 backdrop-blur-2xl">
      {/* logo */}
      <Link to="/" className="flex items-center gap-3 px-6 pt-7 pb-6">
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-soft shadow-xl shadow-accent/30"
        >
          <Flame size={20} className="text-white" />
        </motion.div>
        <div>
          <div className="text-[17px] font-black leading-none tracking-tight">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">Promobot</span>
          </div>
          <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mut/70">deals radar</div>
        </div>
      </Link>

      {/* nav */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition
               ${isActive ? "text-white" : "text-mut hover:bg-white/[0.04] hover:text-white"}`}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="side-active"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/15 to-transparent ring-1 ring-accent/25"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }} />
                )}
                <Icon size={17} className={`relative z-10 ${isActive ? "text-accent-soft" : ""}`} />
                <span className="relative z-10">{label}</span>
                {isActive && <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-accent-soft" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* busca rápida */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <input
            className="field py-1.5 pl-8 text-[12.5px]"
            placeholder="buscar no catálogo…"
            defaultValue=""
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                navigate("/?q=" + encodeURIComponent(e.currentTarget.value.trim()))
              }
            }}
          />
        </div>
      </div>

      {/* coleta */}
      <div className="px-4 pb-5">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={collect} disabled={collecting}
          className="btn w-full">
          {collecting ? <><Loader2 size={15} className="animate-spin" /> {cloud === "fila" ? "Na fila na nuvem…" : "Coletando…"}</>
                      : <><Zap size={15} /> Buscar agora</>}
        </motion.button>
        <div className="mt-3 space-y-1.5 px-1 text-[11px] text-mut/80">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
            </span>
            coletor rodando
          </div>
          <div className="flex items-center gap-2"><ShieldCheck size={12} /> Chrome real (anti-bloqueio)</div>
          <div className="flex items-center gap-2"><Clock3 size={12} /> ciclo a cada 30 min</div>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)
  const location = useLocation()

  useEffect(() => { api.me().then((d) => setAuth(d.logged !== false)).catch(() => setAuth(false)) }, [])

  if (auth === null) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  }

  return (
    <div className="min-h-screen">
      {auth && <Sidebar />}
      <div className={auth ? "pl-[248px]" : ""}>
        <main className="mx-auto max-w-[1500px] px-8 py-7">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname.split("/")[1]}>
              <Route path="/login" element={<LoginPage onOk={() => setAuth(true)} />} />
              <Route path="/" element={auth ? <FeedPage /> : <LoginPage onOk={() => setAuth(true)} />} />
              <Route path="/produto/:id" element={auth ? <ProductPage /> : <LoginPage onOk={() => setAuth(true)} />} />
              <Route path="/watchlist" element={auth ? <WatchlistPage /> : <LoginPage onOk={() => setAuth(true)} />} />
              <Route path="/keywords" element={auth ? <KeywordsPage /> : <LoginPage onOk={() => setAuth(true)} />} />
              <Route path="/insights" element={auth ? <InsightsPage /> : <LoginPage onOk={() => setAuth(true)} />} />
            <Route path="/status" element={auth ? <StatusPage /> : <LoginPage onOk={() => setAuth(true)} />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

export { timeago }
