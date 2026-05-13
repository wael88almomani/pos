import { Component, type ErrorInfo, type ReactNode } from 'react'

type P = { children: ReactNode }
type S = { err?: Error }

export class AppErrorBoundary extends Component<P, S> {
  state: S = {}

  static getDerivedStateFromError(err: Error): S {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error(err, info)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-full flex items-center justify-center p-8 text-center">
          <div className="max-w-lg space-y-4">
            <h1 className="text-xl font-bold text-red-600">حدث خطأ</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 break-all">{this.state.err.message}</p>
            <button
              type="button"
              className="rounded-xl bg-emerald-600 text-white px-4 py-2"
              onClick={() => window.location.reload()}
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
