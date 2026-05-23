// src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
    children: ReactNode
    /** 自訂 fallback UI，不傳則使用預設錯誤畫面 */
    fallback?: (error: Error, reset: () => void) => ReactNode
    /** 元件名稱，用於 console.error 標識來源 */
    name?: string
}

interface State {
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        const label = this.props.name ? `[ErrorBoundary:${this.props.name}]` : '[ErrorBoundary]'
        console.error(label, error, info.componentStack)
    }

    reset = () => this.setState({ error: null })

    render() {
        const { error } = this.state
        if (!error) return this.props.children

        if (this.props.fallback) {
            return this.props.fallback(error, this.reset)
        }

        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', padding: 32, gap: 16, color: '#64748b', textAlign: 'center',
            }}>
                <div style={{ fontSize: 32 }}>⚠️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>
                    {this.props.name ? `「${this.props.name}」` : '此區塊'}發生錯誤
                </div>
                <div style={{
                    fontSize: 12, color: '#94a3b8', background: '#f8fafc',
                    borderRadius: 8, padding: '8px 14px', maxWidth: 400,
                    fontFamily: 'monospace', wordBreak: 'break-all',
                }}>
                    {error.message}
                </div>
                <button
                    onClick={this.reset}
                    style={{
                        padding: '7px 20px', borderRadius: 8, border: 'none',
                        background: '#3b82f6', color: 'white', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                    }}
                >
                    重試
                </button>
            </div>
        )
    }
}
