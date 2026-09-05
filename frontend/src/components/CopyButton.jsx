import { useState } from "react"
import { Check, Copy } from "lucide-react"

/** Botão copiar-para-área-de-transferência com feedback visual. */
export function CopyButton({ text, label = "copiar", className = "btn btn-ghost btn-sm" }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback para contextos sem clipboard API (http)
      const ta = document.createElement("textarea")
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button className={className} onClick={copy} title={`Copiar: ${text.slice(0, 80)}`}>
      {copied ? <><Check size={13} /> copiado</> : <><Copy size={13} /> {label}</>}
    </button>
  )
}

/** Texto de divulgação pronto: título + preço + link de afiliado. */
export function shareText(title, price, url) {
  const priceStr = price != null ? `R$ ${Number(price).toFixed(2).replace(".", ",")}` : ""
  return `🔥 ${title}\n${priceStr ? `💰 ${priceStr}\n` : ""}${url}`
}
