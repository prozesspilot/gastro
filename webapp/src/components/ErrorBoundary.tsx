import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const isDev = import.meta.env.DEV;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-screen" role="alert">
          <div className="error-screen-card">
            <div className="error-screen-icon" aria-hidden="true">⚠</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Etwas ist schiefgegangen
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              Die Seite konnte nicht geladen werden. Versuchen Sie es erneut, oder kehren Sie zum Dashboard zurück.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="primary" onClick={this.handleReload}>↻ Seite neu laden</button>
              <button className="secondary" onClick={this.handleHome}>← Zum Dashboard</button>
            </div>
            {isDev && this.state.error && (
              <div className="error-screen-stack">
                <strong style={{ color: 'var(--status-error-fg)' }}>{this.state.error.name}: {this.state.error.message}</strong>
                {this.state.error.stack && <>{'\n\n'}{this.state.error.stack}</>}
                {this.state.errorInfo?.componentStack && <>{'\n\n'}--- Component Stack ---{this.state.errorInfo.componentStack}</>}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
