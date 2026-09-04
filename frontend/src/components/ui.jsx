// Primitivos de layout do novo sistema visual: página, cabeçalho, estados, selos.
import { Link } from "react-router-dom"
import { AlertTriangle, Inbox, Loader2, SearchX } from "lucide-react"

export function Page({ children, labelledBy }) {
  return (
    <div aria-labelledby={labelledBy} className="space-y-4 sm:space-y-5">
      {children}
    </div>
  )
}

export function PageHeader({ title, description, actions, meta, titleId = "page-title" }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 id={titleId} className="page-title">
          {title}
        </h1>
        {description ? <p className="page-sub">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function StatGrid({ children }) {
  return (
    <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-slate-900"
  return (
    <div className="card-pad">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold tracking-tight ${toneClass}`}>{value}</dd>
      {hint ? <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function ScoreBadge({ score }) {
  if (score == null) return <span className="badge badge-neutral">Sem score</span>
  const cls = score >= 80 ? "badge-good" : score >= 60 ? "badge-warn" : "badge-bad"
  return (
    <span className={`badge ${cls}`} title={`Score da análise: ${score} de 100`}>
      Score {score}
    </span>
  )
}

export function DiscountBadge({ value }) {
  if (!(value > 0)) return null
  return <span className="badge badge-good">−{Math.round(value)}% vs histórico</span>
}

export function MarketBadge({ code, label }) {
  const short = code === "ml" ? "ML" : code === "amazon" ? "Amazon" : label || code
  return (
    <span className="badge badge-neutral" title={label || short}>
      {short}
    </span>
  )
}

export function LoadingState({ label = "Carregando dados…" }) {
  return (
    <div role="status" aria-live="polite" className="card-pad flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      {label}
    </div>
  )
}

export function ErrorState({ title = "Não foi possível carregar", description, onRetry }) {
  return (
    <div role="alert" className="card-pad py-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
      <h2 className="mt-2 text-base font-bold text-slate-900">{title}</h2>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary mt-4">
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="card-pad py-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-slate-900">{title}</h2>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function NoResults({ onClear }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Nenhuma oferta com esses filtros"
      description="Ajuste os filtros ou inicie uma nova coleta para atualizar o catálogo."
      action={
        onClear ? (
          <button type="button" onClick={onClear} className="btn-secondary">
            Limpar filtros
          </button>
        ) : (
          <Link to="/" className="btn-secondary">
            Ver todas as ofertas
          </Link>
        )
      }
    />
  )
}

export function ProductImage({ src, alt, className = "" }) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label="Produto sem imagem"
        className={`grid place-items-center bg-slate-100 text-xs font-medium text-slate-400 ${className}`}
      >
        Sem imagem
      </div>
    )
  }
  return <img src={src} alt={alt || ""} loading="lazy" className={`bg-white object-contain ${className}`} />
}

export function Field({ id, label, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}
