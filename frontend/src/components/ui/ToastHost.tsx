import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import type { ToastTone } from '../../stores/toastStore'
import { cn } from '../../utils/cn'

const toneStyles: Record<ToastTone, { icon: React.ReactNode; className: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    className: 'border-sky-500/25 text-sky-300',
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: 'border-emerald-500/30 text-emerald-300',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: 'border-amber-500/30 text-amber-300',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    className: 'border-red-500/35 text-red-300',
  },
}

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((item) => {
        const tone = toneStyles[item.tone]
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-[#151a20]/95 px-3.5 py-3 shadow-panel backdrop-blur animate-toast-in',
              tone.className,
            )}
            role="status"
          >
            <span className="mt-0.5 shrink-0">{tone.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-zinc-100">{item.title}</div>
              {item.message && (
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">
                  {item.message}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(item.id)}
              className="mt-0.5 rounded p-0.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
