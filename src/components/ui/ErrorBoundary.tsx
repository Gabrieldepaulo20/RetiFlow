import { Component, ReactNode } from 'react';
import { Button } from './button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isChunkLoadError, recoverFromChunkLoadError } from '@/lib/chunkRecovery';
import { logError } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
  /** Fallback customizado opcional — se omitido usa o padrão */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros de renderização no React tree.
 *
 * Uso:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Para páginas inteiras, já está integrado no App.tsx.
 * Para seções menores (gráficos, painéis), envolva individualmente.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Falha de chunk antigo (deploy novo): recarrega a página em vez de mostrar erro.
    // Cobre o caso em que o React.lazy lança no render (não dispara vite:preloadError).
    if (recoverFromChunkLoadError(error)) return;
    logError(error, 'ErrorBoundary');
    if (import.meta.env.DEV) console.error('[ErrorBoundary stack]', info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Erro de chunk obsoleto: orienta recarregar a página inteira (reset não resolve).
      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/60 p-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <RefreshCw className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-amber-700">Nova versão disponível</h3>
            <p className="mb-4 max-w-xs text-xs text-muted-foreground">
              O sistema foi atualizado. Recarregue a página para carregar a versão mais recente.
            </p>
            <Button size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Recarregar agora
            </Button>
          </div>
        );
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/60 p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-amber-700">Estamos restaurando esta tela</h3>
          <p className="mb-4 max-w-xs text-xs text-muted-foreground">
            A página encontrou uma inconsistência temporária. Reabra a tela para carregar tudo de novo com segurança.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Reabrir tela
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
