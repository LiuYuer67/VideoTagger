import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { VideoSelection } from './pages/VideoSelection'
import { TaggingWorkspace } from './pages/TaggingWorkspace'
import { ToastHost } from './components/ui/ToastHost'
import { useProjectStore } from './stores/projectStore'
import { toast } from './stores/toastStore'
import { api } from './services/api'
import { Button } from './components/ui/Button'
import { mergeUniqueTags } from './utils/tags'

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('VideoTagger UI crashed', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center bg-ink-950 px-6">
          <div className="max-w-md rounded-xl border border-ink-700 bg-ink-850 p-7 text-center shadow-panel">
            <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-400">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <h1 className="text-[15px] font-semibold text-zinc-100">The workspace hit a snag</h1>
            <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
              Your saved project files are untouched. Reload the app; if you had unsaved changes, a
              local recovery draft may be available when you reopen the project.
            </p>
            <Button
              variant="primary"
              className="mx-auto mt-5"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => window.location.reload()}
            >
              Reload VideoTagger
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const hasProject = useProjectStore((state) => Boolean(state.project))
  const setGlobalTags = useProjectStore((state) => state.setGlobalTags)

  useEffect(() => {
    api
      .getTags()
      .then(({ tags }) =>
        setGlobalTags(
          mergeUniqueTags(useProjectStore.getState().globalTags, tags),
        ),
      )
      .catch(() => {
        toast.warning(
          'Tag dictionary unavailable',
          'You can still tag, but previous tags will not be suggested this session.',
        )
      })
  }, [setGlobalTags])

  return (
    <AppErrorBoundary>
      <div className="h-full min-h-0">
        {hasProject ? <TaggingWorkspace /> : <VideoSelection />}
        <ToastHost />
      </div>
    </AppErrorBoundary>
  )
}
