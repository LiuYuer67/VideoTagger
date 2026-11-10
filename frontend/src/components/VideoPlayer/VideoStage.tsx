import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Annotation, BoundingBox, VideoInfo } from '../../types'
import { streamUrl } from '../../services/api'
import { BoundingBoxOverlay } from '../BoundingBox/BoundingBoxOverlay'
import { formatTimecode } from '../../utils/time'

interface VideoStageProps {
  videoInfo: VideoInfo
  videoRef: RefObject<HTMLVideoElement>
  annotations: Annotation[]
  frame: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (box: BoundingBox) => void
  onChange: (id: string, box: BoundingBox) => void
  onBeginInteraction: () => void
  onPlaybackState: (playing: boolean) => void
  onLoadedMetadata: () => void
  onSeeked: () => void
  onPlaybackError: (message: string) => void
}

export function VideoStage({
  videoInfo,
  videoRef,
  annotations,
  frame,
  selectedId,
  onSelect,
  onCreate,
  onChange,
  onBeginInteraction,
  onPlaybackState,
  onLoadedMetadata,
  onSeeked,
  onPlaybackError,
}: VideoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [mediaError, setMediaError] = useState<string | null>(null)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const availableWidth = element.clientWidth
      const availableHeight = element.clientHeight
      if (availableWidth <= 0 || availableHeight <= 0) return
      const ratio = videoInfo.width / videoInfo.height || 16 / 9
      let width = availableWidth
      let height = width / ratio
      if (height > availableHeight) {
        height = availableHeight
        width = height * ratio
      }
      setFrameSize({
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [videoInfo.width, videoInfo.height])

  useEffect(() => {
    setMediaError(null)
  }, [videoInfo.video_id])

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 pb-2">
      <div className="pointer-events-none absolute right-4 top-2 z-20 flex items-center gap-2 text-[9.5px] text-white/25">
        <span className="timecode">
          {videoInfo.width} × {videoInfo.height}
        </span>
        <span className="h-2.5 w-px bg-white/10" />
        <span className="timecode">{videoInfo.fps.toFixed(3).replace(/\.?0+$/, '')} fps</span>
      </div>

      <div
        ref={containerRef}
        className="video-desk relative flex h-full w-full items-center justify-center overflow-hidden rounded-sm"
      >
        {frameSize.width > 0 && (
          <div
            className="relative overflow-hidden bg-black shadow-[0_8px_34px_rgba(0,0,0,.55)] ring-1 ring-white/[0.06]"
            style={{ width: frameSize.width, height: frameSize.height }}
          >
            <video
              ref={videoRef}
              src={streamUrl(videoInfo.video_id)}
              className="absolute inset-0 h-full w-full bg-black object-fill"
              preload="auto"
              playsInline
              onLoadedMetadata={onLoadedMetadata}
              onPlay={() => onPlaybackState(true)}
              onPause={() => onPlaybackState(false)}
              onSeeked={onSeeked}
              onEnded={() => onPlaybackState(false)}
              onError={() => {
                const message =
                  'The video could not be played. The cached file may be corrupt or use an unsupported codec.'
                setMediaError(message)
                onPlaybackError(message)
              }}
            />

            {!mediaError && (
              <BoundingBoxOverlay
                annotations={annotations}
                frame={frame}
                selectedId={selectedId}
                onSelect={onSelect}
                onCreate={onCreate}
                onChange={onChange}
                onBeginInteraction={onBeginInteraction}
              />
            )}

            {mediaError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink-950/90 px-8 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
                <div className="max-w-sm text-[12px] leading-relaxed text-zinc-400">
                  {mediaError}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/35 to-transparent" />
            <div className="pointer-events-none absolute bottom-2.5 left-3 z-20 flex items-center gap-2 rounded border border-white/10 bg-black/45 px-2 py-1 backdrop-blur-sm">
              <span className="timecode text-[9px] font-medium text-white/75">
                {formatTimecode(frame / videoInfo.fps, videoInfo.fps)}
              </span>
              <span className="h-2.5 w-px bg-white/15" />
              <span className="timecode text-[9px] text-white/40">F{frame}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
