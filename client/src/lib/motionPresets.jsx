import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'

export const EASE_OUT = [0.16, 1, 0.3, 1]
export const SPRING = { type: 'spring', stiffness: 260, damping: 26 }
export const SOFT_SPRING = { type: 'spring', stiffness: 170, damping: 22 }

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
}

export const slideIn = (x = -16) => ({
  hidden: { opacity: 0, x },
  show: { opacity: 1, x: 0, transition: SOFT_SPRING },
})

export const pop = {
  hidden: { opacity: 0, scale: 0.7 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 18 } },
}

export const stagger = (step = 0.06, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
})

export const pageEnter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, ease: EASE_OUT },
}

export const popover = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
}

export function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
