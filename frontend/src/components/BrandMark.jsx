// Marca PromoBot: símbolo "P" azul em fundo transparente.
//
// O SVG preserva a paleta azul do logo fornecido sem adicionar um fundo,
// permitindo usar o ícone sobre superfícies claras e escuras.
// `width`/`height` fixos + classes de tamanho evitam layout shift.
// Variante completa (símbolo + wordmark PROMO BOT, para fundo escuro):
//   ../assets/brand/promobot-logo-complete-dark.png
// Variante vetorial transparente (mesma paleta) + raster navy de fallback:
//   /brand/promobot-symbol.svg, /brand/promobot-symbol-navy-512.png

export function BrandMark({ size = 36, className = "h-9 w-9", alt = "PromoBot" }) {
  return (
    <img
      src="/brand/promobot-symbol.svg"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 rounded-lg object-cover ${className}`}
    />
  )
}
