import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: 'Playback',
    items: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['←'], label: 'Previous frame' },
      { keys: ['→'], label: 'Next frame' },
      { keys: ['Shift', '← / →'], label: 'Jump 10 frames' },
      { keys: ['Home'], label: 'Go to start' },
      { keys: ['End'], label: 'Go to end' },
    ],
  },
  {
    title: 'Navigate',
    items: [
      { keys: ['['], label: 'Previous tagged frame' },
      { keys: [']'], label: 'Next tagged frame' },
      { keys: ['Ctrl', 'Wheel'], label: 'Zoom timeline under cursor' },
      { keys: ['Drag'], label: 'Pan timeline / scrub playhead' },
    ],
  },
  {
    title: 'Annotate',
    items: [
      { keys: ['Drag'], label: 'Draw a crop region (pauses video)' },
      { keys: ['Delete'], label: 'Delete selected region' },
      { keys: ['Esc'], label: 'Cancel drawing / deselect' },
      { keys: ['Enter'], label: 'Add tag / accept suggestion' },
      { keys: ['Tab'], label: 'Accept highlighted suggestion' },
      { keys: ['↑ ↓'], label: 'Navigate tag suggestions' },
    ],
  },
  {
    title: 'Project',
    items: [
      { keys: ['Ctrl', 'S'], label: 'Save project' },
      { keys: ['Ctrl', 'E'], label: 'Open export' },
      { keys: ['Ctrl', 'O'], label: 'Open project browser' },
      { keys: ['?'], label: 'Show this reference' },
    ],
  },
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      subtitle="Built for staying on the keyboard while tagging frame after frame."
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2.5 border-b border-ink-700 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 rounded px-1 py-1 text-[11px] text-zinc-400"
                >
                  <span>{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key, index) => (
                      <span key={`${key}-${index}`} className="flex items-center gap-1">
                        {index > 0 && <span className="text-[8px] text-zinc-700">+</span>}
                        <span className="kbd h-[19px] px-1.5 text-[9px]">{key}</span>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
