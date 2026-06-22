const CHUNK_RECOVERY_KEY = 'retiflow.chunk-recovery-url';

const CHUNK_LOAD_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
  'vite:preloadError',
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

interface ChunkLoadRecoveryOptions {
  reload?: () => void;
}

/**
 * Se `error` for falha de carregamento de chunk (deploy novo deixou o asset antigo
 * obsoleto), recarrega a página UMA vez por URL (guarda em sessionStorage para não
 * entrar em loop). Retorna true se disparou a recuperação. Usado pelos listeners de
 * evento e pelo ErrorBoundary (quando o erro vem como throw de render do React.lazy).
 */
export function recoverFromChunkLoadError(
  error: unknown,
  options: { preventDefault?: () => void; reload?: () => void } = {},
): boolean {
  if (typeof window === 'undefined') return false;
  if (!isChunkLoadError(error)) return false;

  options.preventDefault?.();
  const reload = options.reload ?? (() => window.location.reload());

  const currentUrl = window.location.href;
  const lastRecoveredUrl = window.sessionStorage.getItem(CHUNK_RECOVERY_KEY);

  if (lastRecoveredUrl === currentUrl) {
    console.error('[chunk-recovery] Falha ao carregar asset mesmo após recarregar.', error);
    return false;
  }

  window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, currentUrl);
  reload();
  return true;
}

export function installChunkLoadRecovery(options: ChunkLoadRecoveryOptions = {}) {
  if (typeof window === 'undefined') return;
  const { reload } = options;

  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    recoverFromChunkLoadError(preloadEvent.payload ?? 'vite:preloadError', {
      preventDefault: () => event.preventDefault(),
      reload,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    recoverFromChunkLoadError(event.reason, {
      preventDefault: () => event.preventDefault(),
      reload,
    });
  });
}
