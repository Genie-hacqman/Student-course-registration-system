import mark from '../assets/unireg-mark.png'

export default function BrandMark({ className = '' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-white ${className}`}>
      <img src={mark} alt="" width="192" height="192" className="size-full object-cover" />
    </span>
  )
}
