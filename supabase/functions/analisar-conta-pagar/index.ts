import { createClient } from 'npm:@supabase/supabase-js@2';

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
  recurrenceIndex?: number;
  totalInstallments?: number;
};

type AnalysisResult = {
  draft: ImportDraft;
  fields: ExtractedField[];
  warnings: string[];
  highlights: string[];
};

const localDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
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

function getConfiguredOrigins() {
  const raw = Deno.env.get('CORS_ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const configuredOrigins = getConfiguredOrigins();

  if (configuredOrigins.length === 0 || configuredOrigins.includes('*')) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': '*' } };
  }

  if (!origin) {
    return { allowed: true, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': configuredOrigins[0] } };
  }

  const allowed = configuredOrigins.includes(origin) || localDevOrigins.has(origin);
  return {
    allowed,
    headers: {
      ...baseCorsHeaders,
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
    },
  };
}

function jsonResponse(body: unknown, status: number, request: Request) {
  const { headers } = getCorsHeaders(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

async function assertAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { ok: false, response: jsonResponse({ error: 'Autenticação obrigatória.' }, 401, request) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: jsonResponse({ error: 'Configuração Supabase ausente na Function.' }, 500, request) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: jsonResponse({ error: 'Usuário autenticado obrigatório para analisar documentos.' }, 401, request) };
  }

  return { ok: true, userId: data.user.id };
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
      recurrenceIndex: typeof draft.recurrenceIndex === 'number' && draft.recurrenceIndex > 0
        ? draft.recurrenceIndex
        : undefined,
      totalInstallments: typeof draft.totalInstallments === 'number' && draft.totalInstallments > 1
        ? draft.totalInstallments
        : undefined,
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
  const cors = getCorsHeaders(request);
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: 'Origem não autorizada.' }), {
      status: 403,
      headers: {
        ...cors.headers,
        'Content-Type': 'application/json',
      },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors.headers });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, request);
  }

  const auth = await assertAuthenticatedUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY não configurada na Supabase Function.' }, 500, request);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const categoriesRaw = String(formData.get('categories') ?? '[]');
    const suppliersRaw = String(formData.get('suppliers') ?? '[]');

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Arquivo obrigatório.' }, 400, request);
    }

    if (!allowedMimeTypes.has(file.type)) {
      return jsonResponse({ error: `Tipo de arquivo não suportado: ${file.type || file.name}` }, 400, request);
    }

    if (file.size > maxFileSizeBytes) {
      return jsonResponse({ error: 'Arquivo acima de 15 MB.' }, 400, request);
    }

    const categories = JSON.parse(categoriesRaw) as Array<{ id: string; name: string }>;
    const suppliers = JSON.parse(suppliersRaw) as Array<{ id: string; name: string }>;
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const fallbackCategoryId = categories[0]?.id ?? '';
    let openAIFileId: string | null = null;

    try {
      openAIFileId = (await uploadOpenAIFile(file, apiKey)).id;

      const today = new Date().toISOString().slice(0, 10);
      const prompt = [
        `Você é um especialista em documentos financeiros brasileiros. Hoje é ${today}.`,
        'Analise o documento e extraia dados de uma conta a pagar. Retorne SOMENTE JSON válido, sem texto adicional.',
        '',
        'FORMATO DE SAÍDA OBRIGATÓRIO:',
        '{ "draft": { "title": string, "supplierName": string, "categoryId": string,',
        '  "dueDate": "YYYY-MM-DD", "issueDate": "YYYY-MM-DD|null",',
        '  "originalAmount": number, "paymentMethod": "PIX|BOLETO|TRANSFERENCIA|CARTAO_CREDITO|CARTAO_DEBITO|DINHEIRO|CHEQUE|DEBITO_AUTOMATICO",',
        '  "recurrence": "NENHUMA|SEMANAL|QUINZENAL|MENSAL|BIMESTRAL|TRIMESTRAL|SEMESTRAL|ANUAL",',
        '  "docNumber": "string|null", "observations": "string|null",',
        '  "isUrgent": boolean, "suggestedStatus": "PAGO|PENDENTE|AGENDADO|INCERTO",',
        '  "recurrenceIndex": number|null, "totalInstallments": number|null },',
        '  "fields": [{ "label": string, "value": string, "confidence": number }],',
        '  "warnings": string[], "highlights": string[] }',
        '',
        'REGRAS CRÍTICAS — leia com atenção:',
        '',
        '1. DATAS — distinguir emissão de vencimento:',
        '   - issueDate = data em que o documento foi emitido/gerado.',
        '   - dueDate = data limite para pagamento. NUNCA confunda as duas.',
        '   - Em boletos: a data de vencimento está na linha digitável (campo 5, posições 33-42) no formato AAAMMDD.',
        '     Se o código de barras/linha digitável estiver visível, prefira essa data sobre qualquer texto.',
        '   - Se não conseguir identificar o vencimento com segurança, use null em issueDate e coloque a data encontrada em warnings.',
        '',
        '2. VALORES — nunca inventar:',
        '   - originalAmount deve ser o valor principal do documento em reais (número positivo sem R$).',
        '   - Em boletos: o valor pode estar no código de barras (posições 10-19 do campo livre).',
        '   - Se houver múltiplos valores (valor bruto, desconto, valor final), use o valor a pagar.',
        '   - Se o valor for ilegível ou ambíguo, use 0 e adicione warning.',
        '',
        '3. FORNECEDOR — identificação:',
        '   - supplierName: nome da empresa emitente (ex: "SABESP", "Enel SP", "Prefeitura de São Paulo").',
        '   - Se o CNPJ do fornecedor estiver visível, inclua em observations no formato "CNPJ: XX.XXX.XXX/XXXX-XX".',
        '   - Se o fornecedor estiver na lista de fornecedores conhecidos, use o nome exatamente como está na lista.',
        '',
        '4. RECORRÊNCIA — inferir pelo tipo de documento:',
        '   - Água, energia elétrica, gás, internet, telefone, aluguel, condomínio → recurrence: "MENSAL".',
        '   - IPTU, IPVA → recurrence: "ANUAL".',
        '   - Plano de saúde mensal → recurrence: "MENSAL".',
        '   - Compra única, nota fiscal de produto, boleto avulso → recurrence: "NENHUMA".',
        '',
        '5. PARCELAMENTO — detectar automaticamente:',
        '   - Se o documento mencionar "parcela X de Y", "X/Y", "prestação X de Y", extraia:',
        '     recurrenceIndex: X (número da parcela atual), totalInstallments: Y (total de parcelas).',
        '   - Caso contrário: recurrenceIndex: null, totalInstallments: null.',
        '',
        '6. URGÊNCIA:',
        '   - isUrgent: true SE o vencimento for hoje ou amanhã (comparar com hoje = ' + today + ').',
        '   - isUrgent: true SE o documento contiver palavras como "URGENTE", "ÚLTIMO DIA", "PROTESTADO", "INADIMPLENTE", "VENCIDO".',
        '   - Caso contrário: isUrgent: false.',
        '',
        '7. STATUS SUGERIDO:',
        '   - "PAGO": documento for comprovante, recibo ou tiver carimbo/selo de quitação.',
        '   - "AGENDADO": documento mencionar agendamento ou débito automático futuro.',
        '   - "PENDENTE": boleto, fatura ou nota fiscal sem evidência de pagamento.',
        '   - "INCERTO": quando não houver evidência suficiente.',
        '',
        '8. CAMPOS fields[] — mostrar ao usuário para revisão:',
        '   Liste os campos que extraiu com label em português, value (texto do documento) e confidence (0-100).',
        '   Exemplos de labels: "Fornecedor", "Valor", "Vencimento", "Emissão", "Documento", "CNPJ", "Forma de pagamento".',
        '   Confidence abaixo de 70 indica que o usuário DEVE revisar antes de salvar.',
        '',
        '9. WARNINGS — sempre informar limitações:',
        '   Adicione warning quando: documento ilegível, data ambígua, valor incerto, CNPJ não encontrado,',
        '   campo inferido (não lido diretamente), recorrência inferida pelo tipo de conta.',
        '   Lembre: "Revise os valores antes de confirmar — esta análise é uma sugestão, não um dado oficial."',
        '',
        '10. CATEGORIA — escolha apenas da lista abaixo. Se não tiver certeza, use a mais genérica:',
        `    ${JSON.stringify(categories)}`,
        '',
        '11. FORNECEDORES CONHECIDOS — prefira corresponder a um da lista se o nome for parecido:',
        `    ${JSON.stringify(suppliers.slice(0, 80))}`,
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
      return jsonResponse(sanitizeAnalysis(parsed, validCategoryIds, fallbackCategoryId), 200, request);
    } finally {
      if (openAIFileId) {
        await deleteOpenAIFile(openAIFileId, apiKey);
      }
    }
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Erro inesperado ao analisar documento.',
    }, 500, request);
  }
});
