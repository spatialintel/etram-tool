import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './ui'

type Props = { children: ReactNode; onReset?: () => void }
type State = { error: Error | null }

/**
 * Keeps a bad chart option or a malformed row from blanking the whole app.
 * Reset via `resetKey` on the consumer side (remount by key).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render failed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="page">
        <div className="error-boundary" role="alert">
          <h2 className="error-boundary-title">This view could not be rendered</h2>
          <p className="error-boundary-detail">{error.message}</p>
          <Button
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
