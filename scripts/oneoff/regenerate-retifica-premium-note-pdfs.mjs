import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const APPLY = process.argv.includes('--apply');
const SAMPLE = process.argv.includes('--sample');
const INCLUDE_MISSING = process.argv.includes('--include-missing');
const NORMALIZE_PATHS = process.argv.includes('--normalize-paths');
const ONLY_PATH_MISMATCHES = process.argv.includes('--only-path-mismatches');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : 0;
const ONLY_ARG = process.argv.find((arg) => arg.startsWith('--only='));
const ONLY_OS = ONLY_ARG ? ONLY_ARG.split('=')[1].trim() : null;
const TARGET_OWNER_EMAIL = process.env.RETIFLOW_TARGET_OWNER_EMAIL ?? 'retificapremium5@gmail.com';
const TARGET_OWNER_ID = process.env.RETIFLOW_TARGET_OWNER_ID ?? null;
const CONCURRENCY = Math.max(1, Number(process.env.REGENERATE_NOTE_PDFS_CONCURRENCY ?? 3));
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'retifica-premium-note-pdfs-regeneration.json');
const SAMPLE_DIR = process.env.SAMPLE_DIR
  ?? path.join(process.cwd(), 'tmp', 'pdfs', 'retifica-premium-regenerated');
const NOTAS_BUCKET = 'notas';
const reactPdfEmptyTextWarning = "Invalid '' string child outside <Text> component";
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  if (args.some((arg) => String(arg).includes(reactPdfEmptyTextWarning))) return;
  originalConsoleError(...args);
};
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  if (String(chunk).includes(reactPdfEmptyTextWarning)) return true;
  return originalStderrWrite(chunk, ...args);
};

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        value = value.replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

const env = {
  ...readEnvFile(path.join(process.cwd(), '.env.local')),
  ...readEnvFile(path.join(process.cwd(), '.env.integration')),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  || env.VITE_SUPABASE_SERVICE_ROLE_KEY
  || env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase service env ausente.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function asNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function extractStoragePath(pathOrUrl) {
  const value = cleanText(pathOrUrl);
  if (!value || value.startsWith('blob:')) return null;

  const normalizePath = (input) => decodeURIComponent(input)
    .replace(/^\/+/, '')
    .replace(/^object\/(?:public|sign)\/notas\//, '') || null;

  if (!/^https?:\/\//i.test(value)) return normalizePath(value);

  try {
    const url = new URL(value);
    const publicMarker = `/storage/v1/object/public/${NOTAS_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${NOTAS_BUCKET}/`;
    const marker = url.pathname.includes(publicMarker)
      ? publicMarker
      : url.pathname.includes(signedMarker)
        ? signedMarker
        : null;
    if (!marker) return null;
    return normalizePath(url.pathname.split(marker)[1] ?? '');
  } catch {
    return null;
  }
}

function safeSampleFilename(osNumero, noteId) {
  const os = cleanText(osNumero).replace(/[^a-zA-Z0-9-]+/g, '-') || 'OS';
  return `${os}-${String(noteId).slice(0, 8)}.pdf`;
}

const monthNames = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const weekdayNames = [
  'Domingo',
  'Segunda-feira',
  'Terca-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sabado',
];

function datePartsFromIso(value) {
  const dateText = String(value ?? '').slice(0, 10);
  const [year, month, day] = dateText.split('-').map(Number);
  if (!year || !month || !day) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      weekday: now.getDay(),
    };
  }
  const noon = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  return { year, month, day, weekday: noon.getUTCDay() };
}

function defaultStoragePath(note) {
  const { year, month, day, weekday } = datePartsFromIso(note.created_at);
  const dayText = String(day).padStart(2, '0');
  const monthName = monthNames[month - 1] ?? String(month).padStart(2, '0');
  const weekdayName = weekdayNames[weekday] ?? '';
  return [
    'retifica-premium',
    String(year),
    monthName,
    `${dayText} (${weekdayName})`,
    `${note.os}.pdf`,
  ].join('/');
}

function normalizeStoragePathForOs(storagePath, osNumero) {
  const value = cleanText(storagePath);
  if (!value) return null;
  const parts = value.split('/');
  parts[parts.length - 1] = `${osNumero}.pdf`;
  return parts.join('/');
}

function resolveTargetStoragePath(note) {
  const currentPath = extractStoragePath(note.pdf_url);
  if (!currentPath) return defaultStoragePath(note);
  return NORMALIZE_PATHS ? normalizeStoragePathForOs(currentPath, note.os) : currentPath;
}

function hasPathMismatch(note) {
  const currentPath = extractStoragePath(note.pdf_url);
  if (!currentPath) return false;
  return currentPath !== normalizeStoragePathForOs(currentPath, note.os);
}

async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function fetchIn(table, columns, column, ids, orderBy) {
  const rows = [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  for (const chunk of chunks) {
    let query = supabase.schema('RetificaPremium').from(table).select(columns).in(column, chunk);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function getTargetOwner() {
  let query = supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, auth_id, nome, email, status');

  if (TARGET_OWNER_ID) {
    query = query.eq('id_usuarios', TARGET_OWNER_ID);
  } else {
    query = query.eq('email', TARGET_OWNER_EMAIL);
  }

  const { data, error } = await query;
  if (error) throw error;
  const active = (data ?? []).filter((row) => row.status !== false);
  if (active.length !== 1) {
    throw new Error(`Conta destino ambigua ou ausente. Encontradas: ${active.length}.`);
  }
  return active[0];
}

async function loadNotes(ownerId) {
  let query = supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select(`
      id_notas_servico,
      created_at,
      updated_at,
      os,
      prazo,
      defeito,
      observacoes,
      fk_clientes,
      fk_veiculos,
      fk_status,
      total_servicos,
      total_produtos,
      total,
      pdf_url,
      pdf_formato,
      finalizado_em,
      contato_nome,
      contato_telefone,
      criado_por_usuario,
      fk_template_documento,
      documento_tema_snapshot,
      documento_config_snapshot
    `)
    .eq('criado_por_usuario', ownerId)
    .order('created_at', { ascending: true });

  if (!INCLUDE_MISSING) {
    query = query.not('pdf_url', 'is', null).neq('pdf_url', '');
  }

  if (ONLY_OS) query = query.eq('os', ONLY_OS);
  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function firstByKey(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (value && !map.has(value)) map.set(value, row);
  }
  return map;
}

function groupByKey(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

function firstContact(contactsByClient, clientId, tipo) {
  return (contactsByClient.get(clientId) ?? []).find((contact) => contact.tipo_contato === tipo)?.contato ?? null;
}

function buildCompanySettings(row, ownerId) {
  return {
    fkUsuarios: ownerId,
    razaoSocial: row?.razao_social ?? 'Retífica Premium',
    nomeFantasia: row?.nome_fantasia ?? 'Retífica Premium',
    cnpj: row?.cnpj ?? '',
    inscricaoEstadual: row?.inscricao_estadual ?? '',
    inscricaoMunicipal: row?.inscricao_municipal ?? '',
    endereco: row?.endereco ?? '',
    cidade: row?.cidade ?? '',
    estado: row?.estado ?? '',
    cep: row?.cep ?? '',
    telefone: row?.telefone ?? '(16) 3524-4661',
    whatsapp: row?.whatsapp ?? '',
    email: row?.email ?? '',
    site: row?.site ?? '',
    instagram: row?.instagram ?? '',
    horarioAtendimento: row?.horario_atendimento ?? '',
    mensagemAtendimento: row?.mensagem_atendimento ?? '',
    observacaoDocumentos: row?.observacao_documentos ?? '',
    brandPrimaryColor: row?.brand_primary_color ?? '#1a7a8a',
    brandSecondaryColor: row?.brand_secondary_color ?? '#0f7f95',
    updatedAt: row?.updated_at ?? null,
  };
}

function buildDetalhes(note, maps) {
  const client = maps.clients.get(note.fk_clientes);
  const address = maps.addresses.get(note.fk_clientes);
  const vehicle = maps.vehicles.get(note.fk_veiculos);
  const motor = maps.motors.get(vehicle?.fk_tipos_de_motor);
  const status = maps.statuses.get(note.fk_status);
  const serviceRows = (maps.serviceRelations.get(note.id_notas_servico) ?? []);
  const purchaseRows = (maps.purchaseNotes.get(note.id_notas_servico) ?? []);

  if (!client) throw new Error(`Cliente ausente para ${note.os}`);
  if (!vehicle) throw new Error(`Veiculo ausente para ${note.os}`);
  if (!status) throw new Error(`Status ausente para ${note.os}`);

  const endereco = address?.rua
    ? `${address.rua}${address.numero ? `, ${address.numero}` : ''}`.trim()
    : null;

  const itens = serviceRows.map((row) => {
    const item = maps.serviceItems.get(row.fk_servicos_itens);
    const quantidade = asNumber(row.quantidade);
    const valor = asNumber(row.valor);
    const desconto = asNumber(row.desconto);
    return {
      id_rel: row.id_rel_notas_servi,
      sku: row.fk_servicos_itens,
      descricao: item?.nome ?? 'Serviço',
      detalhes: row.detalhes ?? null,
      quantidade,
      preco_unitario: valor,
      desconto_porcentagem: desconto,
      subtotal_item: (quantidade * valor) * (1 - (desconto / 100)),
    };
  });

  return {
    status: 200,
    cabecalho: {
      id_nota: note.id_notas_servico,
      os_numero: note.os,
      prazo: note.prazo,
      defeito: note.defeito,
      observacoes: note.observacoes,
      data_criacao: note.created_at,
      finalizado_em: note.finalizado_em,
      total: asNumber(note.total),
      total_servicos: asNumber(note.total_servicos),
      total_produtos: asNumber(note.total_produtos),
      criado_por_usuario: note.criado_por_usuario,
      pdf_url: note.pdf_url,
      contato_nome: note.contato_nome ?? null,
      contato_telefone: note.contato_telefone ?? null,
      fk_template_documento: note.fk_template_documento ?? null,
      documento_tema_snapshot: note.documento_tema_snapshot ?? null,
      documento_config_snapshot: note.documento_config_snapshot ?? null,
      cliente: {
        id: client.id_clientes,
        nome: client.nome,
        documento: client.documento ?? '',
        endereco,
        cep: address?.cep ?? null,
        cidade: address?.cidade ?? null,
        telefone: firstContact(maps.contactsByClient, client.id_clientes, 'telefone'),
        email: firstContact(maps.contactsByClient, client.id_clientes, 'email'),
      },
      veiculo: {
        id: vehicle.id_veiculos,
        modelo: vehicle.modelo,
        placa: vehicle.placa ?? null,
        km: asNumber(vehicle.km),
        motor: motor?.tipo ?? '',
      },
      status: {
        id: status.id_status_notas,
        nome: status.nome,
        index: status.index,
        tipo_status: status.tipo_status,
      },
    },
    itens_servico: itens,
    notas_compra_vinculadas: purchaseRows.map((purchase) => {
      const purchaseStatus = maps.statuses.get(purchase.fk_status);
      return {
        id_nota_compra: purchase.id_notas_compra,
        oc_numero: purchase.oc,
        status_nome: purchaseStatus?.nome ?? '',
        status_tipo: purchaseStatus?.tipo_status ?? '',
      };
    }),
    financeiro_servicos: {
      total_bruto: serviceRows.reduce((sum, row) => sum + asNumber(row.quantidade) * asNumber(row.valor), 0),
      total_liquido: itens.reduce((sum, item) => sum + item.subtotal_item, 0),
    },
  };
}

async function buildMaps(notes) {
  const clientIds = unique(notes.map((note) => note.fk_clientes));
  const vehicleIds = unique(notes.map((note) => note.fk_veiculos));
  const statusIds = unique(notes.map((note) => note.fk_status));
  const noteIds = unique(notes.map((note) => note.id_notas_servico));

  const [
    clients,
    addresses,
    contacts,
    vehicles,
    statuses,
    serviceRelations,
    purchaseNotes,
  ] = await Promise.all([
    fetchIn('Clientes', 'id_clientes, nome, documento', 'id_clientes', clientIds),
    fetchIn('Enderecos', 'id_enderecos, fk_clientes, rua, numero, cep, cidade, estado, uf, created_at', 'fk_clientes', clientIds, { column: 'created_at' }),
    fetchIn('Contatos', 'id_contatos, fk_clientes, tipo_contato, contato, created_at', 'fk_clientes', clientIds, { column: 'created_at' }),
    fetchIn('Veiculos', 'id_veiculos, modelo, placa, km, fk_tipos_de_motor', 'id_veiculos', vehicleIds),
    fetchIn('Status_Notas', 'id_status_notas, nome, index, tipo_nota, tipo_status', 'id_status_notas', statusIds),
    fetchIn('Rel_NotaS_Serv', 'id_rel_notas_servi, fk_notas_servico, fk_servicos_itens, quantidade, valor, desconto, detalhes, created_at', 'fk_notas_servico', noteIds, { column: 'created_at' }),
    fetchIn('Notas_de_Compra', 'id_notas_compra, oc, fk_notas_servico, fk_status', 'fk_notas_servico', noteIds),
  ]);

  const motorIds = unique(vehicles.map((vehicle) => vehicle.fk_tipos_de_motor));
  const serviceItemIds = unique(serviceRelations.map((row) => row.fk_servicos_itens));
  const purchaseStatusIds = unique(purchaseNotes.map((row) => row.fk_status)).filter((id) => !statusIds.includes(id));

  const [motors, serviceItems, purchaseStatuses] = await Promise.all([
    fetchIn('Tipos_de_Motor', 'id_tipos_de_motor, tipo', 'id_tipos_de_motor', motorIds),
    fetchIn('Servicos_ou_Itens', 'id_servicos_itens, nome', 'id_servicos_itens', serviceItemIds),
    fetchIn('Status_Notas', 'id_status_notas, nome, index, tipo_nota, tipo_status', 'id_status_notas', purchaseStatusIds),
  ]);

  const statusesById = new Map([...statuses, ...purchaseStatuses].map((row) => [row.id_status_notas, row]));

  return {
    clients: new Map(clients.map((row) => [row.id_clientes, row])),
    addresses: firstByKey(addresses, 'fk_clientes'),
    contactsByClient: groupByKey(contacts, 'fk_clientes'),
    vehicles: new Map(vehicles.map((row) => [row.id_veiculos, row])),
    motors: new Map(motors.map((row) => [row.id_tipos_de_motor, row])),
    statuses: statusesById,
    serviceRelations: groupByKey(serviceRelations, 'fk_notas_servico'),
    serviceItems: new Map(serviceItems.map((row) => [row.id_servicos_itens, row])),
    purchaseNotes: groupByKey(purchaseNotes, 'fk_notas_servico'),
  };
}

async function loadDocumentSettings(owner, normalizeDocumentTemplateConfig) {
  const [{ data: companyRows, error: companyError }, { data: templateRows, error: templateError }, { data: themeRows, error: themeError }] = await Promise.all([
    supabase.schema('RetificaPremium')
      .from('Configuracoes_Empresa_Usuario')
      .select('*')
      .eq('fk_usuarios', owner.id_usuarios)
      .limit(1),
    supabase.schema('RetificaPremium')
      .from('Templates_Documentos_Usuario')
      .select('*')
      .eq('fk_usuarios', owner.id_usuarios)
      .eq('document_type', 'entry_note')
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1),
    supabase.schema('RetificaPremium')
      .from('Temas_Documentos_Usuario')
      .select('*')
      .eq('fk_usuarios', owner.id_usuarios)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);
  if (companyError) throw companyError;
  if (templateError) throw templateError;
  if (themeError) throw themeError;

  const company = buildCompanySettings(companyRows?.[0], owner.id_usuarios);
  const activeTemplate = templateRows?.[0] ?? null;
  const activeTheme = (themeRows ?? []).find((theme) => {
    const appliesTo = Array.isArray(theme.applies_to_json) ? theme.applies_to_json : [];
    return appliesTo.length === 0 || appliesTo.includes('entry_note');
  }) ?? null;

  return {
    company,
    activeTemplate,
    activeTheme,
    forNote(note) {
      const baseConfig = activeTemplate?.config_json ?? {};
      const themeConfig = activeTheme?.config_json ? { theme: activeTheme.config_json } : {};
      const snapshotConfig = note.documento_config_snapshot ?? {};
      return {
        fkUsuarios: owner.id_usuarios,
        documentType: 'entry_note',
        company,
        template: null,
        theme: null,
        resolvedConfig: normalizeDocumentTemplateConfig('entry_note', {
          ...baseConfig,
          ...themeConfig,
          ...snapshotConfig,
        }),
      };
    },
  };
}

async function pdfInstanceToBuffer(instance) {
  if (typeof instance.toBlob === 'function') {
    const blob = await instance.toBlob();
    return Buffer.from(await blob.arrayBuffer());
  }

  const output = await instance.toBuffer();
  if (Buffer.isBuffer(output)) return output;

  const chunks = [];
  for await (const chunk of output) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function validateUploadedPdf(storagePath) {
  const { data, error } = await supabase.storage.from(NOTAS_BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) throw new Error(`signed_url_failed:${error?.message ?? 'missing_url'}`);
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error(`signed_download_http_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') throw new Error('signed_download_not_pdf');
  return buffer.length;
}

async function runPool(items, worker) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(items.length, 1)) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await worker(item);
      } catch (error) {
        results[currentIndex] = {
          status: 'failed',
          note_id: item.id_notas_servico,
          os: item.os,
          pdf_url: item.pdf_url,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      const done = results.filter(Boolean).length;
      if (done % 25 === 0 || done === items.length) {
        console.log(`[regenerate-note-pdfs] ${done}/${items.length} processados`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const vite = await createServer({
    appType: 'custom',
    server: { middlewareMode: true },
    logLevel: 'error',
  });

  try {
    const [
      { NotaPDFTemplate },
      { normalizeDocumentTemplateConfig },
    ] = await Promise.all([
      vite.ssrLoadModule('/src/components/notes/NotaPDFTemplate.tsx'),
      vite.ssrLoadModule('/src/services/domain/documentCustomization.ts'),
    ]);

    const owner = await getTargetOwner();
    let notes = await loadNotes(owner.id_usuarios);
    if (ONLY_PATH_MISMATCHES) {
      notes = notes.filter(hasPathMismatch);
    }
    const maps = await buildMaps(notes);
    const documentSettings = await loadDocumentSettings(owner, normalizeDocumentTemplateConfig);

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    if (SAMPLE) fs.mkdirSync(SAMPLE_DIR, { recursive: true });

    const results = await runPool(notes, async (note) => {
      const storagePath = extractStoragePath(note.pdf_url);
      const targetStoragePath = resolveTargetStoragePath(note);
      if (!targetStoragePath || (!storagePath && !INCLUDE_MISSING)) {
        return {
          status: 'skipped_non_storage_pdf',
          note_id: note.id_notas_servico,
          os: note.os,
          pdf_url: note.pdf_url,
        };
      }

      const dados = buildDetalhes(note, maps);
      const settingsForNote = documentSettings.forNote(note);
      const buffer = await pdfInstanceToBuffer(pdf(React.createElement(NotaPDFTemplate, {
        dados,
        documentSettings: settingsForNote,
        accentColor: settingsForNote.resolvedConfig.theme.primaryColor,
      })));

      if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
        throw new Error('generated_not_pdf');
      }

      const samplePath = SAMPLE
        ? path.join(SAMPLE_DIR, safeSampleFilename(note.os, note.id_notas_servico))
        : null;
      if (samplePath) fs.writeFileSync(samplePath, buffer);

      if (!APPLY) {
        return {
          status: 'dry_run_generated',
          note_id: note.id_notas_servico,
          os: note.os,
          path: targetStoragePath,
          previous_path: storagePath,
          bytes: buffer.length,
          sample_path: samplePath,
        };
      }

      const { error: uploadError } = await supabase.storage.from(NOTAS_BUCKET).upload(targetStoragePath, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) throw new Error(`upload_failed:${uploadError.message}`);

      const signedBytes = await validateUploadedPdf(targetStoragePath);

      const noteUpdate = {};
      if (note.pdf_formato !== 'supabase_storage') noteUpdate.pdf_formato = 'supabase_storage';
      if (note.pdf_url !== targetStoragePath) noteUpdate.pdf_url = targetStoragePath;

      if (Object.keys(noteUpdate).length > 0) {
        const { error: updateError } = await supabase
          .schema('RetificaPremium')
          .from('Notas_de_Servico')
          .update(noteUpdate)
          .eq('id_notas_servico', note.id_notas_servico);
        if (updateError) throw new Error(`pdf_format_update_failed:${updateError.message}`);
      }

      if (storagePath && storagePath !== targetStoragePath) {
        const { error: removeError } = await supabase.storage.from(NOTAS_BUCKET).remove([storagePath]);
        if (removeError) throw new Error(`remove_old_path_failed:${removeError.message}`);
      }

      return {
        status: 'regenerated',
        note_id: note.id_notas_servico,
        os: note.os,
        path: targetStoragePath,
        previous_path: storagePath,
        bytes: buffer.length,
        signed_bytes: signedBytes,
        sample_path: samplePath,
      };
    });

    const counters = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {});
    const failures = results.filter((result) => result.status === 'failed');
    const report = {
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      target_owner: {
        id_usuarios: owner.id_usuarios,
        auth_id_prefix: String(owner.auth_id ?? '').slice(0, 8),
        nome: owner.nome,
        email: owner.email,
      },
      filters: {
        only_os: ONLY_OS,
        limit: LIMIT || null,
        sample: SAMPLE,
        include_missing: INCLUDE_MISSING,
        normalize_paths: NORMALIZE_PATHS,
        only_path_mismatches: ONLY_PATH_MISMATCHES,
      },
      notes_found: notes.length,
      counters,
      failures,
      results,
    };
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      mode: report.mode,
      notes_found: report.notes_found,
      counters,
      failures: failures.length,
      report_path: REPORT_PATH,
    }, null, 2));

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await vite.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
