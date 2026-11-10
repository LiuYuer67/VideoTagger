import { cn } from '../../utils/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn('h-9 w-9', className)}
    >
      <rect x="1" y="1" width="38" height="38" rx="9" fill="#151a20" stroke="#2a323b" />
      <path
        d="M11 15V11H15M25 11H29V15M29 25V29H25M15 29H11V25"
        stroke="#f59a4b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="14.5" y="14.5" width="11" height="11" rx="1.5" stroke="#e9edf2" strokeOpacity=".55" />
      <path d="M18 16.8L23.6 20L18 23.2V16.8Z" fill="#f59a4b" />
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      <div className="leading-none">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-semibold tracking-tight text-zinc-100',
              compact ? 'text-[13px]' : 'text-[17px]',
            )}
          >
            VIDEOTAGGER
          </span>
          {!compact && (
            <span className="rounded-sm border border-ink-650 px-1 py-0.5 text-[8px] font-semibold tracking-[0.12em] text-zinc-500">
              STUDIO
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 text-[10px] font-medium tracking-[0.16em] text-zinc-600">
            VIDEO TAGGING WORKSTATION
          </div>
        )}
      </div>
    </div>
  )
}
