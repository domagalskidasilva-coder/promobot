// Componentes de UI estilo ReactBits / 21st.dev — adaptados para o Promobot.
// Sem emojis: ícones via lucide-react, animações via framer-motion.
import { useEffect, useRef, useState, useCallback } from "react"
import { motion, useInView, useSpring, useTransform, animate } from "framer-motion"

/* ---------------- SpotlightCard (21st.dev style) ---------------- */
export function SpotlightCard({ children, className = "", spotlightColor = "rgba(244, 63, 94, 0.18)" }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x: -999, y: -999 })
  const [opacity, setOpacity] = useState(0)

  const onMove = useCallback((e) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 transition-colors duration-300 hover:border-ink-600 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 45%)`,
        }}
      />
      {children}
    </div>
  )
}

/* ---------------- CountUp (ReactBits style) ---------------- */
export function CountUp({ value, duration = 1.2, className = "", prefix = "", suffix = "" }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, value, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("pt-BR")}
      {suffix}
    </span>
  )
}

/* ---------------- ShinyText (ReactBits style) ---------------- */
export function ShinyText({ children, className = "", speed = 3 }) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: "linear-gradient(120deg, #e8eaee 40%, #ffffff 50%, #e8eaee 60%)",
        backgroundSize: "200% 100%",
        animation: `shine ${speed}s linear infinite`,
      }}
    >
      {children}
    </span>
  )
}

/* ---------------- AnimatedList (21st.dev style) ---------------- */
export function AnimatedList({ children, className = "", itemDelay = 0.05 }) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div
              key={child?.key ?? i}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, delay: Math.min(i * itemDelay, 0.6), ease: [0.22, 1, 0.36, 1] }}
            >
              {child}
            </motion.div>
          ))
        : children}
    </div>
  )
}

/* ---------------- TiltedCard (21st.dev, versão leve) ---------------- */
export function TiltedCard({ children, className = "", maxTilt = 6 }) {
  const ref = useRef(null)
  const rx = useSpring(0, { stiffness: 260, damping: 22 })
  const ry = useSpring(0, { stiffness: 260, damping: 22 })

  const onMove = (e) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    ry.set(px * maxTilt)
    rx.set(-py * maxTilt)
  }
  const onLeave = () => { rx.set(0); ry.set(0) }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  )
}

/* ---------------- FadeIn genérico ---------------- */
export function FadeIn({ children, delay = 0, y = 14, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ---------------- ScorePill (badges de IA com cor por faixa) ---------------- */
export function ScorePill({ score }) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-bold text-mut">
        sem IA
      </span>
    )
  }
  const color = score >= 80 ? "bg-good" : score >= 60 ? "bg-warn" : "bg-accent"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${color} px-2 py-0.5 text-[11px] font-extrabold text-ink-950`}>
      IA {score}
    </span>
  )
}
