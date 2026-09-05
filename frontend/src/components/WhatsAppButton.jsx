import { useState } from "react"
import { Check, MessageCircle } from "lucide-react"
import { api } from "../lib/api"

/**
 * Botão "Copiar para WhatsApp": pede ao backend a mensagem no modelo do canal
 * (com link de afiliado encurtado) e copia com feedback visual.
 */
export function WhatsAppButton({ productId, label = "WhatsApp", className = "btn-secondary btn-sm" }) {
  const [state, setState] = useState("idle") // idle | loading | copied | error

  const copy = async () => {
    setState("loading")
    try {
      const { text } = await api.share(productId)
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const ta = document.createElement("textarea")
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setState("copied")
    } catch {
      setState("error")
    }
    setTimeout(() => setState("idle"), 2500)
  }

  const inner =
    state === "copied" ? (
      <>
        <Check size={13} /> copiado!
      </>
    ) : state === "error" ? (
      "erro"
    ) : (
      <>
        <MessageCircle size={13} /> {state === "loading" ? "..." : label}
      </>
    )

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      title="Copiar divulgação pronta para o WhatsApp (link oficial com afiliado)"
      aria-live="polite"
    >
      {inner}
    </button>
  )
}
