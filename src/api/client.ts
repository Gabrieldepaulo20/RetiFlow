import { ApiError } from './errors';

export interface ApiFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout em ms. Default: 10 000 ms */
  timeout?: number;
  /** AbortSignal externo (ex.: de useEffect cleanup). Será encadeado ao timeout. */
  signal?: AbortSignal;
  /**
   * Validador opcional para o corpo da resposta.
   * Passe `(raw) => schema.parse(raw)` para validar com Zod.
   * Se omitido, o corpo é retornado sem validação de runtime.
   */
  validate?: <T>(raw: unknown) => T;
}

/**
 * Cliente HTTP padronizado do sistema.
 *
 * - Timeout automático via AbortController
 * - Encadeia sinal externo (cancelamento por useEffect)
 * - Normaliza todos os erros em ApiError
 * - Valida corpo da resposta se `validate` for fornecido
 *
 * Para APIs externas (ViaCEP, BrasilAPI) e futuro backend, usar sempre esta função.
 * Componentes e páginas NUNCA devem chamar fetch() diretamente.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { timeout = 10_000, signal: externalSignal, validate, ...fetchInit } = options;

  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(new Error(`Timeout após ${timeout}ms`)),
    timeout,
  );

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new ApiError(null, 'TIMEOUT', 'Request cancelado antes de iniciar', externalSignal.reason);
    }
    externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
  }

  try {
    const response = await fetch(url, { ...fetchInit, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let body: string | undefined;
      try {
        body = await response.text();
      } catch {
        // ignora falha ao ler body do erro
      }
      throw new ApiError(
        response.status,
        'HTTP_ERROR',
        `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 120)}` : ''}`,
      );
    }

    const json = (await response.json()) as unknown;

    if (validate) {
      try {
        return validate<T>(json);
      } catch (validationError) {
        throw new ApiError(
          response.status,
          'VALIDATION_ERROR',
          'Resposta da API não corresponde ao schema esperado',
          validationError,
        );
      }
    }

    return json as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) throw error;

    if (
      error instanceof Error &&
      (error.name === 'AbortError' || controller.signal.aborted)
    ) {
      throw new ApiError(null, 'TIMEOUT', 'Request cancelado por timeout ou sinal externo', error);
    }

    throw new ApiError(null, 'NETWORK_ERROR', 'Falha na requisição de rede', error);
  }
}
