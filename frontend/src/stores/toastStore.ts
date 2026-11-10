import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  title: string
  message?: string
  tone: ToastTone
  duration: number
}

interface ToastStore {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID()
    const item: ToastItem = {
      id,
      title: toast.title,
      message: toast.message,
      tone: toast.tone,
      duration: toast.duration ?? 4500,
    }
    set((state) => ({ toasts: [...state.toasts.slice(-4), item] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }))
    }, item.duration)
    return id
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) })),
}))

export const toast = {
  info: (title: string, message?: string) =>
    useToastStore.getState().push({ title, message, tone: 'info' }),
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ title, message, tone: 'success' }),
  error: (title: string, message?: string) =>
    useToastStore.getState().push({ title, message, tone: 'error', duration: 6500 }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().push({ title, message, tone: 'warning', duration: 5500 }),
}
