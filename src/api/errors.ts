/**
 * Erro normalizado para toda comunicação HTTP do sistema.
 * Permite distinguir erros de rede, timeout, HTTP 4xx/5xx e erros de validação
 * sem depender da forma que cada endpoint retorna erros.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status code, ou null se o erro ocorreu antes de receber resposta */
    public readonly status: number | null,
    /** Código semântico — ex.: 'TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'VALIDATION_ERROR' */
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isTimeout() {
    return this.code === 'TIMEOUT';
  }

  get isNetworkError() {
    return this.code === 'NETWORK_ERROR';
  }

  get isClientError() {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }

  get isServerError() {
    return this.status !== null && this.status >= 500;
  }
}
