type ExtractedField = {
  label: string;
  value: string;
  confidence: number;
};

type SuggestedStatus = 'PAGO' | 'PENDENTE' | 'AGENDADO' | 'INCERTO';

type ImportDraft = {
  title: string;
  supplierName: string;
  categoryId: string;
  dueDate: string;
  issueDate?: string;
  originalAmount: number;
  paymentMethod: 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO' | 'CHEQUE' | 'DEBITO_AUTOMATICO';
  recurrence: 'NENHUMA' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  docNumber?: string;
  observations?: string;
  isUrgent: boolean;
  suggestedStatus: SuggestedStatus;
};

type AnalysisResult = {
  draft: ImportDraft;
  fields: ExtractedField[];
  warnings: string[];
  highlights: string[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const maxFileSizeBytes = 15 * 1024 * 1024;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getOutputText(response: unknown) {
  if (isRecord(response) && typeof response.output_text === 'string') return response.output_text;

  const chunks: string[] = [];
  const output = isRecord(response) && Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const contentItems = isRecord(item) && Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (isRecord(content) && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('A IA não retornou JSON válido.');
    return JSON.parse(match[0]);
  }
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

function normalizeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : 0;
}

function sanitizeAnalysis(raw: unknown, validCategoryIds: Set<string>, fallbackCategoryId: string): AnalysisResult {
  const root = isRecord(raw) ? raw : {};
  const draft = isRecord(root.draft) ? root.draft : {};
  const paymentMethod = String(draft.paymentMethod ?? 'BOLETO').toUpperCase();
  const recurrence = String(draft.recurrence ?? 'NENHUMA').toUpperCase();
  const suggestedStatus = String(draft.suggestedStatus ?? 'INCERTO').toUpperCase();
  const rawCategoryId = typeof draft.categoryId === 'string' ? draft.categoryId : '';
  const categoryId = validCategoryIds.has(rawCategoryId) ? rawCategoryId : fallbackCategoryId;
  const originalAmount = normalizeNumber(draft.originalAmount);

  return {
    draft: {
      title: String(draft.title ?? 'Conta importada com IA').slice(0, 120),
      supplierName: String(draft.supplierName ?? 'Fornecedor não identificado').slice(0, 120),
      categoryId,
      dueDate: normalizeDate(draft.dueDate),
      issueDate: typeof draft.issueDate === 'string' ? normalizeDate(draft.issueDate) : undefined,
      originalAmount,
      paymentMethod: ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'CHEQUE', 'DEBITO_AUTOMATICO'].includes(paymentMethod)
        ? paymentMethod as ImportDraft['paymentMethod']
        : 'BOLETO',
      recurrence: ['NENHUMA', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].includes(recurrence)
        ? recurrence as ImportDraft['recurrence']
        : 'NENHUMA',
      docNumber: typeof draft.docNumber === 'string' ? draft.docNumber.slice(0, 60) : undefined,
      observations: typeof draft.observations === 'string' ? draft.observations.slice(0, 500) : undefined,
      isUrgent: Boolean(draft.isUrgent),
      suggestedStatus: ['PAGO', 'PENDENTE', 'AGENDADO', 'INCERTO'].includes(suggestedStatus)
        ? suggestedStatus as SuggestedStatus
        : 'INCERTO',
    },
    fields: Array.isArray(root.fields) ? root.fields.slice(0, 12).map((field: unknown) => {
      const item = isRecord(field) ? field : {};
      return {
        label: String(item.label ?? 'Campo').slice(0, 50),
        value: String(item.value ?? 'Não identificado').slice(0, 160),
        confidence: Math.max(0, Math.min(100, Number(item.confidence ?? 60))),
      };
    }) : [],
    warnings: Array.isArray(root.warnings) ? root.warnings.slice(0, 6).map((item: unknown) => String(item).slice(0, 180)) : [
      'Revise os campos antes de salvar a conta.',
    ],
    highlights: Array.isArray(root.highlights) ? root.highlights.slice(0, 6).map((item: unknown) => String(item).slice(0, 180)) : [
      'Documento analisado por IA.',
    ],
  };
}

async function uploadOpenAIFile(file: File, apiKey: string) {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', file, file.name);

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Falha ao enviar arquivo para IA (${response.status}).`);
  }

  return await response.json() as { id: string };
}

async function deleteOpenAIFile(fileId: string, apiKey: string) {
  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }).catch(() => undefined);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  if (!request.headers.get('Authorization')) {
    return jsonResponse({ error: 'Autenticação obrigatória.' }, 401);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY não configurada na Supabase Function.' }, 500);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const categoriesRaw = String(formData.get('categories') ?? '[]');
    const suppliersRaw = String(formData.get('suppliers') ?? '[]');

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Arquivo obrigatório.' }, 400);
    }

    if (!allowedMimeTypes.has(file.type)) {
      return jsonResponse({ error: `Tipo de arquivo não suportado: ${file.type || file.name}` }, 400);
    }

    if (file.size > maxFileSizeBytes) {
      return jsonResponse({ error: 'Arquivo acima de 15 MB.' }, 400);
    }

    const categories = JSON.parse(categoriesRaw) as Array<{ id: string; name: string }>;
    const suppliers = JSON.parse(suppliersRaw) as Array<{ id: string; name: string }>;
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const fallbackCategoryId = categories[0]?.id ?? '';
    let openAIFileId: string | null = null;

    try {
      openAIFileId = (await uploadOpenAIFile(file, apiKey)).id;

      const prompt = [
        'Extraia dados financeiros de uma conta a pagar brasileira.',
        'Retorne somente JSON válido com este formato:',
        '{ "draft": { "title": string, "supplierName": string, "categoryId": string, "dueDate": "YYYY-MM-DD", "issueDate": "YYYY-MM-DD opcional", "originalAmount": number, "paymentMethod": "PIX|BOLETO|TRANSFERENCIA|CARTAO_CREDITO|CARTAO_DEBITO|DINHEIRO|CHEQUE|DEBITO_AUTOMATICO", "recurrence": "NENHUMA|SEMANAL|QUINZENAL|MENSAL|BIMESTRAL|TRIMESTRAL|SEMESTRAL|ANUAL", "docNumber": string opcional, "observations": string opcional, "isUrgent": boolean, "suggestedStatus": "PAGO|PENDENTE|AGENDADO|INCERTO" }, "fields": [{ "label": string, "value": string, "confidence": number }], "warnings": string[], "highlights": string[] }',
        'Escolha categoryId apenas da lista fornecida. Se não tiver certeza, use a categoria mais genérica.',
        `Categorias disponíveis: ${JSON.stringify(categories)}`,
        `Fornecedores conhecidos: ${JSON.stringify(suppliers.slice(0, 80))}`,
        'Não invente valor, vencimento ou fornecedor com confiança alta se o documento não permitir leitura clara.',
      ].join('\n');

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          temperature: 0,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                { type: 'input_file', file_id: openAIFileId },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Falha na análise por IA (${response.status}): ${text.slice(0, 300)}`);
      }

      const data = await response.json();
      const parsed = parseJsonObject(getOutputText(data));
      return jsonResponse(sanitizeAnalysis(parsed, validCategoryIds, fallbackCategoryId));
    } finally {
      if (openAIFileId) {
        await deleteOpenAIFile(openAIFileId, apiKey);
      }
    }
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Erro inesperado ao analisar documento.',
    }, 500);
  }
});
