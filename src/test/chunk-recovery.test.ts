import { afterEach, describe, expect, it, vi } from 'vitest';
import { installChunkLoadRecovery, isChunkLoadError, recoverFromChunkLoadError } from '@/lib/chunkRecovery';

describe('chunk load recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('identifica falha de import dinamico antigo', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/OSPreviewModal-old.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Erro comum de negócio'))).toBe(false);
  });

  it('recarrega uma unica vez quando o Vite falha ao carregar chunk de deploy anterior', () => {
    window.sessionStorage.clear();
    const reload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installChunkLoadRecovery({ reload });

    const firstEvent = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    firstEvent.payload = new Error('Failed to fetch dynamically imported module: /assets/OSPreviewModal-old.js');
    window.dispatchEvent(firstEvent);

    const secondEvent = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    secondEvent.payload = new Error('Failed to fetch dynamically imported module: /assets/OSPreviewModal-old.js');
    window.dispatchEvent(secondEvent);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(firstEvent.defaultPrevented).toBe(true);
    expect(secondEvent.defaultPrevented).toBe(true);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('recoverFromChunkLoadError: recarrega so para erro de chunk e respeita o guard', () => {
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();

    // erro comum nao recarrega
    expect(recoverFromChunkLoadError(new Error('Erro de negócio'), { reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    // erro de chunk recarrega uma vez
    const chunkErr = new Error('Failed to fetch dynamically imported module: /assets/x.js');
    expect(recoverFromChunkLoadError(chunkErr, { reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // mesma URL: nao recarrega de novo (evita loop)
    expect(recoverFromChunkLoadError(chunkErr, { reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
