import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildDataManagerIngestRequest,
  buildHashedGoogleUserData,
  buildStableOfflineTransactionId,
  classifyDiagnosticPolling,
  classifyDataManagerFailure,
  classifyDataManagerIngestSuccess,
  diagnosticPollAt,
  normalizeGoogleEmail,
  normalizeGooglePhone,
  parseRetryAfter,
  resolveDataManagerDiagnosticTransition,
  retryAt,
  summarizeDataManagerDiagnostics,
  type DataManagerDiagnosticSummary,
  type DataManagerQueueItem,
} from '../../supabase/functions/_shared/google-data-manager';

const queueItem: DataManagerQueueItem = {
  id_marketing_offline_conversions: 'queue-1',
  conversion_kind: 'cabecote_recebido_avaliacao',
  click_id_type: 'gclid',
  click_id: 'test-click-id',
  conversion_date_time: '2026-08-19T13:45:12-03:00',
  conversion_value: '125.129',
  currency_code: 'brl',
  order_id: 'retiflow:tenant:cabecote:os-123',
  attempts: 1,
};

describe('Google Ads Data Manager v1', () => {
  it('mantém o entrypoint conectado ao handler v1 e remove o upload legado', () => {
    const entrypoint = readFileSync(resolve(
      process.cwd(),
      'supabase/functions/marketing-offline-conversions/index.ts',
    ), 'utf8');
    const handler = readFileSync(resolve(
      process.cwd(),
      'supabase/functions/marketing-offline-conversions/data-manager-handler.ts',
    ), 'utf8');
    expect(entrypoint).toContain('handleDataManagerOfflineConversions');
    expect(`${entrypoint}\n${handler}`).not.toContain('uploadClickConversions');
    expect(handler).toContain('https://datamanager.googleapis.com/v1/events:ingest');
    expect(handler).toContain('https://datamanager.googleapis.com/v1/requestStatus:retrieve');
    expect(handler.match(/AbortSignal\.timeout/g)).toHaveLength(3);
    expect(handler).toContain(".lte('next_attempt_at', reconciliationNow)");
    expect(handler).toContain("state: 'request_validation_only'");
    expect(handler).toContain("state: 'inactive'");
    expect(handler).toContain('}, 503);');
    expect(handler).toContain('processing_started_at: null');
  });

  it('separa validation only de ingestão real sem exigir requestId para o hold', () => {
    expect(classifyDataManagerIngestSuccess({ validateOnly: true }))
      .toBe('request_validation_only');
    expect(classifyDataManagerIngestSuccess({ validateOnly: true, requestId: '' }))
      .toBe('request_validation_only');
    expect(classifyDataManagerIngestSuccess({ validateOnly: false, requestId: 'request-1' }))
      .toBe('awaiting_diagnostics');
    expect(classifyDataManagerIngestSuccess({ validateOnly: false }))
      .toBe('missing_request_id');

    const handler = readFileSync(resolve(
      process.cwd(),
      'supabase/functions/marketing-offline-conversions/data-manager-handler.ts',
    ), 'utf8');
    const holdBranch = handler.slice(
      handler.indexOf("if (ingestDisposition === 'request_validation_only')"),
      handler.indexOf("if (ingestDisposition === 'missing_request_id')"),
    );
    expect(holdBranch).toContain('return await holdRequestValidationOnly');
    expect(holdBranch).not.toContain('retrieveDiagnostics');
  });

  it('monta uma conversão offline idempotente com horário RFC3339, moeda e identificador permitido', async () => {
    const request = await buildDataManagerIngestRequest({
      item: queueItem,
      destination: {
        loginCustomerId: '123-456-7890',
        operatingCustomerId: '987-654-3210',
        conversionActionId: '1122334455',
      },
      validateOnly: true,
    });

    expect(request).toEqual({
      destinations: [{
        reference: 'retiflow_cabecote_recebido_avaliacao',
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: '1234567890' },
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '9876543210' },
        productDestinationId: '1122334455',
      }],
      events: [{
        destinationReferences: ['retiflow_cabecote_recebido_avaliacao'],
        transactionId: 'retiflow:tenant:cabecote:os-123',
        eventTimestamp: '2026-08-19T16:45:12.000Z',
        conversionValue: 125.13,
        currency: 'BRL',
        eventSource: 'WEB',
        adIdentifiers: { gclid: 'test-click-id' },
      }],
      validateOnly: true,
    });
  });

  it.each([
    'client_registered',
    'cabecote_recebido_avaliacao',
    'orcamento_emitido',
    'os_aprovada',
  ] as const)('usa WEB para o marco %s originado no fluxo web', async (conversionKind) => {
    const request = await buildDataManagerIngestRequest({
      item: { ...queueItem, conversion_kind: conversionKind },
      destination: {
        loginCustomerId: '1234567890',
        operatingCustomerId: '9876543210',
        conversionActionId: '1122334455',
      },
      validateOnly: true,
    });
    expect(request.events[0].eventSource).toBe('WEB');
  });

  it('falha fechado se a fila legada trouxer click ID inválido ou com PII', async () => {
    const destination = {
      loginCustomerId: '1234567890',
      operatingCustomerId: '9876543210',
      conversionActionId: '1122334455',
    };
    await expect(buildDataManagerIngestRequest({
      item: { ...queueItem, click_id: 'pessoa@example.com' },
      destination,
      validateOnly: true,
    })).rejects.toThrow('Identificador de anúncio inválido.');
    await expect(buildDataManagerIngestRequest({
      item: { ...queueItem, click_id: '5516999999999' },
      destination,
      validateOnly: true,
    })).rejects.toThrow('Identificador de anúncio inválido.');
    await expect(buildDataManagerIngestRequest({
      item: { ...queueItem, click_id_type: 'email' as DataManagerQueueItem['click_id_type'] },
      destination,
      validateOnly: true,
    })).rejects.toThrow('Tipo do identificador de anúncio inválido.');
  });

  it('gera transaction_id estável por tenant, marco comercial e entidade', () => {
    const input = { ownerId: 'tenant-1', kind: 'os_aprovada' as const, entityId: 'os-42' };
    expect(buildStableOfflineTransactionId(input)).toBe('retiflow:tenant-1:os_aprovada:os-42');
    expect(buildStableOfflineTransactionId(input)).toBe(buildStableOfflineTransactionId(input));
  });

  it('só inclui identificadores fornecidos pelo usuário com opt-in explícito e hash HEX', async () => {
    expect(normalizeGoogleEmail(' Nome.Sobrenome+teste@GoogleMail.com '))
      .toBe('nomesobrenome@gmail.com');
    expect(normalizeGooglePhone(' +55 (11) 98888-7777 ')).toBe('+5511988887777');
    expect(normalizeGooglePhone('11988887777')).toBeNull();

    const denied = await buildHashedGoogleUserData(
      { emails: ['pessoa@example.com'], phones: ['+5511988887777'] },
      {
        allowUserData: true,
        consent: { adUserData: 'CONSENT_DENIED', adPersonalization: 'CONSENT_DENIED' },
      },
    );
    expect(denied).toBeNull();

    const granted = await buildHashedGoogleUserData(
      { emails: ['pessoa@example.com'], phones: ['+5511988887777'] },
      {
        allowUserData: true,
        consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_DENIED' },
      },
    );
    expect(granted?.userIdentifiers).toHaveLength(2);
    expect(granted?.userIdentifiers.every((identifier) =>
      Object.values(identifier).every((hash) => /^[a-f0-9]{64}$/.test(hash))
    )).toBe(true);
  });

  it.each([
    [undefined, undefined, true],
    [408, null, false],
    [429, 'RESOURCE_EXHAUSTED', false],
    [500, 'INTERNAL', false],
    [502, 'UNAVAILABLE', false],
    [503, 'UNKNOWN', false],
    [504, 'DEADLINE_EXCEEDED', false],
  ])('repete somente falha transitória (%s/%s)', (httpStatus, apiStatus, networkError) => {
    expect(classifyDataManagerFailure({ httpStatus, apiStatus, networkError })).toBe('retry');
  });

  it.each([
    [400, 'INVALID_ARGUMENT'],
    [401, 'UNAUTHENTICATED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
    [409, 'FAILED_PRECONDITION'],
    [422, null],
  ])('manda falha permanente para quarentena (%s/%s)', (httpStatus, apiStatus) => {
    expect(classifyDataManagerFailure({ httpStatus, apiStatus })).toBe('permanent');
  });

  it('aplica backoff com jitter determinístico e respeita Retry-After', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(retryAt({ attempts: 1, now, random: 0.5 }))
      .toBe('2026-08-19T12:05:00.000Z');
    expect(retryAt({ attempts: 2, now, random: 0.5, retryAfter: '900' }))
      .toBe('2026-08-19T12:15:00.000Z');
    expect(parseRetryAfter('120', now)).toBe(120_000);
  });

  it('agenda diagnostics em 30/39/50,7/60 minutos, com jitter e prazo separados', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(diagnosticPollAt({ pollAttempt: 0, now, random: 0.5 }))
      .toBe('2026-08-19T12:30:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 1, now, random: 0.5 }))
      .toBe('2026-08-19T12:39:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 2, now, random: 0.5 }))
      .toBe('2026-08-19T12:50:42.000Z');
    expect(diagnosticPollAt({ pollAttempt: 3, now, random: 0.5 }))
      .toBe('2026-08-19T13:00:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 0, now, random: 0 }))
      .toBe('2026-08-19T12:27:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 0, now, random: 1 }))
      .toBe('2026-08-19T12:33:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 20, now, random: 1 }))
      .toBe('2026-08-19T13:00:00.000Z');
    expect(diagnosticPollAt({ pollAttempt: 1, now, random: 0.5, retryAfter: '7200' }))
      .toBe('2026-08-19T13:00:00.000Z');
  });

  it('nunca habilita diagnostics para validation only e respeita nextDiagnosticAt/24h', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(classifyDiagnosticPolling({ validateOnly: true, now }))
      .toBe('request_validation_only');
    expect(classifyDiagnosticPolling({
      validateOnly: false,
      now,
      nextDiagnosticAt: '2026-08-19T12:30:00Z',
      diagnosticDeadlineAt: '2026-08-20T12:00:00Z',
    })).toBe('wait');
    expect(classifyDiagnosticPolling({
      validateOnly: false,
      now,
      nextDiagnosticAt: '2026-08-19T11:59:00Z',
      diagnosticDeadlineAt: '2026-08-20T12:00:00Z',
    })).toBe('poll');
    expect(classifyDiagnosticPolling({
      validateOnly: false,
      now,
      nextDiagnosticAt: '2026-08-19T11:59:00Z',
      diagnosticDeadlineAt: '2026-08-19T12:00:00Z',
    })).toBe('deadline');
  });

  it('mantém requestId em processing nas falhas transitórias de diagnostics', () => {
    const handler = readFileSync(resolve(
      process.cwd(),
      'supabase/functions/marketing-offline-conversions/data-manager-handler.ts',
    ), 'utf8');
    const diagnosticsNetworkCatch = handler.slice(
      handler.indexOf("code: 'DATA_MANAGER_DIAGNOSTICS_NETWORK_ERROR'"),
      handler.indexOf('if (!response.ok)'),
    );
    expect(diagnosticsNetworkCatch).toContain('summary.processing += 1');
    expect(diagnosticsNetworkCatch).not.toContain('markFailure');
    expect(handler).toContain("state: 'awaiting_diagnostics'");
    expect(handler).toContain("code: 'DATA_MANAGER_DIAGNOSTICS_DEADLINE_EXCEEDED'");
    expect(handler).toContain('permanent: true');
  });

  it('não confunde requestId com resultado e classifica o diagnóstico final', () => {
    expect(summarizeDataManagerDiagnostics({
      requestStatusPerDestination: [{ requestStatus: 'PROCESSING' }],
    }).outcome).toBe('processing');

    expect(summarizeDataManagerDiagnostics({
      requestStatusPerDestination: [{
        requestStatus: 'SUCCESS',
        eventsIngestionStatus: { recordCount: '1' },
      }],
    })).toMatchObject({ outcome: 'success', recordCount: 1 });

    expect(summarizeDataManagerDiagnostics({
      requestStatusPerDestination: [{
        requestStatus: 'FAILURE',
        errorInfo: { errorCounts: [{
          recordCount: '1',
          reason: 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID',
        }] },
      }],
    }).outcome).toBe('duplicate');

    expect(summarizeDataManagerDiagnostics({
      requestStatusPerDestination: [{
        requestStatus: 'FAILURE',
        errorInfo: { errorCounts: [{
          recordCount: '1',
          reason: 'PROCESSING_ERROR_REASON_INTERNAL_ERROR',
        }] },
      }],
    }).outcome).toBe('failed');

    expect(summarizeDataManagerDiagnostics({
      requestStatusPerDestination: [{
        requestStatus: 'PARTIAL_SUCCESS',
        errorInfo: { errorCounts: [{
          recordCount: '1',
          reason: 'PROCESSING_ERROR_REASON_INVALID_GCLID',
        }] },
      }],
    }).outcome).toBe('failed');
  });

  it('exige exatamente um registro antes de concluir SUCCESS', () => {
    for (const recordCount of [undefined, '0', '2']) {
      expect(summarizeDataManagerDiagnostics({
        requestStatusPerDestination: [{
          requestStatus: 'SUCCESS',
          ...(recordCount === undefined
            ? {}
            : { eventsIngestionStatus: { recordCount } }),
        }],
      })).toMatchObject({
        outcome: 'inconsistent',
        recordCount: recordCount === undefined ? 0 : Number(recordCount),
      });
    }
  });

  it('resolve transições puras sem reingerir requestId aceito', () => {
    expect(resolveDataManagerDiagnosticTransition({ transportFailure: 'retry' }))
      .toBe('awaiting_diagnostics');
    expect(resolveDataManagerDiagnosticTransition({ transportFailure: 'permanent' }))
      .toBe('failed');

    const diagnostics = (outcome: DataManagerDiagnosticSummary['outcome']) => ({
      outcome,
      statuses: [],
      reasons: [],
      recordCount: outcome === 'success' ? 1 : 0,
    });
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('success') }))
      .toBe('uploaded');
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('duplicate') }))
      .toBe('uploaded');
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('processing') }))
      .toBe('awaiting_diagnostics');
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('unknown') }))
      .toBe('awaiting_diagnostics');
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('failed') }))
      .toBe('failed');
    expect(resolveDataManagerDiagnosticTransition({ diagnostics: diagnostics('inconsistent') }))
      .toBe('failed');
  });
});
