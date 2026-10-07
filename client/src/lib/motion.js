import { useEffect, useRef, useState } from 'react'

const query = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return undefined
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function useCountUp(target, duration = 600) {
  const reduced = usePrefersReducedMotion()
  const animate = typeof target === 'number' && !reduced
  const [value, setValue] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (!animate) return undefined
    const start = performance.now()
    const begin = from.current
    let frame
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(begin + (target - begin) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, animate])

  return animate ? value : target
}
