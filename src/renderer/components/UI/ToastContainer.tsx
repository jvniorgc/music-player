import { useToastStore } from '../../stores/toast'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
}

const colors = {
  success: 'bg-green-600/90 border-green-500/30',
  error: 'bg-red-600/90 border-red-500/30',
  info: 'bg-bg-elevated/90 border-border'
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-2">
      {toasts.map(toast => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl min-w-[280px] max-w-[400px] fade-in ${colors[toast.type]}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="p-0.5 rounded-full hover:bg-white/10 text-white/60 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
