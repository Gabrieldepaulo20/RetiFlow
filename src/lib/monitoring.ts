import { AwsRum, AwsRumConfig } from 'aws-rum-web';

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

  if (!monitorId || !identityPool) return;

  try {
    const config: AwsRumConfig = {
      sessionSampleRate: 1,
      identityPoolId: identityPool,
      endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
      telemetries: ['performance', 'errors', 'http'],
      allowCookies: true,
      enableXRay: false,
    };

    rumClient = new AwsRum(monitorId, '1.0.0', region, config);
  } catch {
    // Falha silenciosa — monitoramento nunca deve travar o app
  }
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
