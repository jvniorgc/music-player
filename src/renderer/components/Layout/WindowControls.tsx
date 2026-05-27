import { Minus, Square, X } from 'lucide-react'

export default function WindowControls() {
  return (
    <div className="flex items-center no-drag">
      <button
        onClick={() => window.api.windowMinimize()}
        className="w-11 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <Minus size={14} className="text-text-secondary" />
      </button>
      <button
        onClick={() => window.api.windowMaximize()}
        className="w-11 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <Square size={11} className="text-text-secondary" />
      </button>
      <button
        onClick={() => window.api.windowClose()}
        className="w-11 h-8 flex items-center justify-center hover:bg-red-500/80 transition-colors"
      >
        <X size={14} className="text-text-secondary" />
      </button>
    </div>
  )
}
