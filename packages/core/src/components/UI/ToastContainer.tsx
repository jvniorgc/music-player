import { useToastStore } from '../../stores/toast'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
}

const colors = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-text-secondary'
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore(useShallow(s => ({ toasts: s.toasts, dismiss: s.dismiss })))

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-2">
      {toasts.map(toast => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-md border border-border bg-surface-2 shadow-lg shadow-black/40 min-w-[280px] max-w-[400px] fade-in`}
          >
            <Icon size={16} className={`shrink-0 ${colors[toast.type]}`} />
            <span className="text-sm text-text-primary flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="p-0.5 rounded-full hover:bg-white/10 text-text-tertiary hover:text-text-primary shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
