import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '@renderer/i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

// Sem isso, qualquer exceção não capturada durante a renderização (inclusive em
// telas geradas/alteradas pela IA) derruba a árvore React inteira e deixa a
// janela em branco, sem nenhuma pista do que aconteceu.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info })
    console.error('Erro não tratado na interface:', error, info)
  }

  private reset = (): void => {
    this.setState({ error: null, info: null })
  }

  private reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw', padding: 32, boxSizing: 'border-box',
        background: 'var(--bg-main, #1e1e1e)', color: 'var(--text-bright, #fff)',
        fontFamily: 'system-ui, sans-serif', textAlign: 'center', gap: 14
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: 'var(--error, #f14c4c)' }}>
          {i18n.t('errorBoundary.title')}
        </h1>
        <p style={{ margin: 0, maxWidth: 640, color: 'var(--text-dim, #999)', fontSize: 13, lineHeight: 1.5 }}>
          {i18n.t('errorBoundary.description')}
        </p>
        <details style={{ maxWidth: 720, width: '100%', textAlign: 'left', fontSize: 11.5, color: 'var(--text-dim, #999)' }}>
          <summary style={{ cursor: 'pointer', marginBottom: 8 }}>{i18n.t('errorBoundary.technicalDetails')}</summary>
          <pre style={{
            margin: 0, padding: 12, overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: 'var(--bg-input, #252526)', border: '1px solid var(--border, #3c3c3c)', borderRadius: 5
          }}>
            {error.message}
            {info?.componentStack ?? ''}
          </pre>
        </details>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            onClick={this.reset}
            style={{
              padding: '8px 16px', borderRadius: 5, border: '1px solid var(--border, #3c3c3c)',
              background: 'var(--bg-input, #252526)', color: 'var(--text-bright, #fff)', cursor: 'pointer', fontSize: 13
            }}
          >
            {i18n.t('errorBoundary.tryToContinue')}
          </button>
          <button
            onClick={this.reload}
            style={{
              padding: '8px 16px', borderRadius: 5, border: '1px solid var(--accent, #007acc)',
              background: 'var(--accent, #007acc)', color: '#fff', cursor: 'pointer', fontSize: 13
            }}
          >
            {i18n.t('errorBoundary.reloadIde')}
          </button>
        </div>
      </div>
    )
  }
}
