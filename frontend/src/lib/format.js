// Formatação e helpers compartilhados (pt-BR). Sem dependências.

export function timeago(iso) {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d} d`
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function brl(value, opts = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—"
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: opts.compact ? 0 : 2,
  })
}

export function brl0(value) {
  return brl(value, { compact: true })
}

export function pct(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—"
  return `${Number(value).toFixed(digits)}%`
}

export function marketLabel(code, fallback) {
  const map = { ml: "Mercado Livre", amazon: "Amazon" }
  return map[code] || fallback || code || "—"
}

export function marketShort(code) {
  const map = { ml: "ML", amazon: "Amazon" }
  return map[code] || code || "—"
}

export function scoreTone(score) {
  if (score == null) return "neutral"
  if (score >= 80) return "good"
  if (score >= 60) return "warn"
  return "bad"
}

export function scoreLabel(score) {
  if (score == null) return "Sem avaliação"
  if (score >= 80) return "Ótima oportunidade"
  if (score >= 60) return "Boa oportunidade"
  if (score >= 40) return "Oportunidade moderada"
  return "Oportunidade fraca"
}
