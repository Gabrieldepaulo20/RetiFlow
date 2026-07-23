import type { AwsRum, AwsRumConfig } from 'aws-rum-web';

let rumClient: AwsRum | null = null;

/**
 * Inicializa o CloudWatch RUM para monitoramento de erros em produção.
 *
 * Requer no Amplify Console (Environment variables):
 *   VITE_AWS_REGION              ex: sa-east-1
 *   VITE_CW_APP_MONITOR_ID      ID do AppMonitor criado no CloudWatch RUM
 *   VITE_CW_IDENTITY_POOL_ID    Cognito Identity Pool com permissão PutRumEvents
 *
 * Criar AppMonitor: AWS Console → CloudWatch → RUM → Add app monitor
 */
export function initMonitoring(): void {
  if (!import.meta.env.PROD) return;

  const monitorId   = import.meta.env.VITE_CW_APP_MONITOR_ID;
  const identityPool= import.meta.env.VITE_CW_IDENTITY_POOL_ID;
  const region      = import.meta.env.VITE_AWS_REGION ?? 'sa-east-1';
  const configuredSampleRate = Number(import.meta.env.VITE_CW_SESSION_SAMPLE_RATE ?? 0.1);
  const sessionSampleRate = Number.isFinite(configuredSampleRate)
    ? Math.min(1, Math.max(0, configuredSampleRate))
    : 0.1;
  const appVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown';

  if (!monitorId || !identityPool) return;

  // Import dinâmico: a lib aws-rum-web (pesada) só entra no bundle como chunk
  // separado, carregado sob demanda em produção — fora do bundle de entrada.
  void import('aws-rum-web')
    .then(({ AwsRum }) => {
      const config: AwsRumConfig = {
        sessionSampleRate,
        identityPoolId: identityPool,
        endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
        telemetries: ['performance', 'errors', 'http'],
        allowCookies: false,
        enableXRay: false,
      };

      rumClient = new AwsRum(monitorId, appVersion, region, config);
    })
    .catch(() => {
      // Falha silenciosa — monitoramento nunca deve travar o app
    });
}

/** Registra um erro manualmente (ex: catch de operação crítica). */
export function logError(error: unknown, context?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (context) err.message = `[${context}] ${err.message}`;

  if (import.meta.env.DEV) {
    console.error(err);
  }

  rumClient?.recordError(err);
}
