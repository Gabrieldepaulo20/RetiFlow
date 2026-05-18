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

export function installChunkLoadRecovery(options: ChunkLoadRecoveryOptions = {}) {
  if (typeof window === 'undefined') return;
  const reload = options.reload ?? (() => window.location.reload());

  const recover = (error: unknown, preventDefault?: () => void) => {
    if (!isChunkLoadError(error)) return;

    preventDefault?.();

    const currentUrl = window.location.href;
    const lastRecoveredUrl = window.sessionStorage.getItem(CHUNK_RECOVERY_KEY);

    if (lastRecoveredUrl === currentUrl) {
      console.error('[chunk-recovery] Falha ao carregar asset mesmo após recarregar.', error);
      return;
    }

    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, currentUrl);
    reload();
  };

  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    recover(preloadEvent.payload ?? 'vite:preloadError', () => event.preventDefault());
  });

  window.addEventListener('unhandledrejection', (event) => {
    recover(event.reason, () => event.preventDefault());
  });
}
