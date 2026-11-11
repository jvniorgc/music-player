import iconUrl from '../../../../../build/icon.png'

export default function AppIcon({ size = 64, className = '' }: { size?: number; className?: string }) {
  return <img src={iconUrl} width={size} height={size} alt="" draggable={false} className={className} />
}
