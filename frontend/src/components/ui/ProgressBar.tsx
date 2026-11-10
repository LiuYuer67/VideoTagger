import { cn } from '../../utils/cn'

export function ProgressBar({
  value,
  className,
  indeterminate = false,
}: {
  value: number
  className?: string
  indeterminate?: boolean
}) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-accent transition-[width] duration-300 ease-out',
          indeterminate && 'w-1/3 animate-soft-pulse',
        )}
        style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
