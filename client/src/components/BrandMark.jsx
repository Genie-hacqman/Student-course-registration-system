import mark from '../assets/unireg-mark.png'

/**
 * The UniReg logo badge: the mortarboard on a white tile. `className` sets the size, radius, shadow and ring, which differ
 * by where it sits. Kept free of `cx` so components/ui.jsx can use it without a circular import.
 */
export default function BrandMark({ className = '' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-white ${className}`}>
      <img src={mark} alt="" width="192" height="192" className="size-full object-cover" />
    </span>
  )
}
