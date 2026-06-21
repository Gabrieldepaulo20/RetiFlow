import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const LEGACY_COMPANY_ID = Number(process.env.LEGACY_COMPANY_ID ?? 5);
const TARGET_OWNER_EMAIL = process.env.RETIFLOW_TARGET_OWNER_EMAIL ?? 'retificapremium5@gmail.com';
const LEGACY_CONNECTION_PATH = process.env.LEGACY_CONNECTION_PATH
  ?? '/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas/amplify/backend/function/controledenotas/src/connectionBD.js';
const VERIFY_STORAGE = process.env.VERIFY_STORAGE !== '0';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = process.env.REPORT_DIR
  ?? path.join(process.cwd(), 'outputs', 'relatorios', `${TIMESTAMP}-depara-os-retifica-premium`);

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

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeOsExact(value) {
  return cleanText(value);
}

function normalizeOsNumber(value) {
  const raw = digits(value);
  if (!raw) return null;
  const stripped = raw.replace(/^0+/, '');
  return stripped || '0';
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isDeletedLegacy(service) {
  return Number(service.deletado ?? 0) === 1;
}

function isStoragePath(value) {
  const storagePath = cleanText(value);
  return Boolean(storagePath)
    && !/^https?:\/\//i.test(storagePath)
    && !storagePath.startsWith('blob:')
    && !storagePath.startsWith('local-upload://');
}

function csvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (!/[",\n\r;]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function pickFirst(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && cleanText(row[name]) !== '') {
      return row[name];
    }
  }
  return null;
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

async function loadLegacySnapshot() {
  if (!fs.existsSync(LEGACY_CONNECTION_PATH)) {
    throw new Error(`Connection legado nao encontrado: ${LEGACY_CONNECTION_PATH}`);
  }

  const require = createRequire(import.meta.url);
  const { ConnectBD } = require(LEGACY_CONNECTION_PATH);
  const connection = await ConnectBD();

  try {
    const [services] = await connection.query(
      'select * from servico where empresa_id = ? order by id_servico asc',
      [LEGACY_COMPANY_ID],
    );
    const [clients] = await connection.query(
      'select * from cliente where empresa_id = ?',
      [LEGACY_COMPANY_ID],
    );
    const [vehicles] = await connection.query(
      'select v.* from veiculo v join cliente c on c.id_cliente = v.cliente_id where c.empresa_id = ?',
      [LEGACY_COMPANY_ID],
    );
    const serviceIds = services.map((row) => row.id_servico).filter((id) => id !== null && id !== undefined);
    const [items] = serviceIds.length > 0
      ? await connection.query(
          `select * from servico_item where servico_id in (${serviceIds.map(() => '?').join(',')})`,
          serviceIds,
        )
      : [[]];

    return { services, clients, vehicles, items };
  } finally {
    if (typeof connection.end === 'function') await connection.end();
  }
}

async function getTargetOwner() {
  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, auth_id, nome, email, status')
    .ilike('email', TARGET_OWNER_EMAIL)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id_usuarios || data.status === false) {
    throw new Error(`Conta destino ativa nao encontrada para ${TARGET_OWNER_EMAIL}.`);
  }
  return data;
}

async function loadSupabaseSnapshot(owner) {
  const [notes, clients, statuses] = await Promise.all([
    fetchAll(() => supabase
      .schema('RetificaPremium')
      .from('Notas_de_Servico')
      .select('id_notas_servico, os, created_at, updated_at, prazo, fk_clientes, fk_veiculos, fk_status, total, total_servicos, total_produtos, pdf_url, pdf_formato, payment_status, origem')
      .eq('criado_por_usuario', owner.id_usuarios)
      .order('created_at', { ascending: true })),
    fetchAll(() => supabase
      .schema('RetificaPremium')
      .from('Clientes')
      .select('id_clientes, nome, documento')
      .eq('fk_criado_por', owner.id_usuarios)),
    fetchAll(() => supabase
      .schema('RetificaPremium')
      .from('Status_Notas')
      .select('id_status_notas, nome, index, tipo_nota, tipo_status')),
  ]);

  const vehicleIds = [...new Set(notes.map((note) => note.fk_veiculos).filter(Boolean))];
  const vehicles = [];
  for (let i = 0; i < vehicleIds.length; i += 100) {
    const ids = vehicleIds.slice(i, i + 100);
    const { data, error } = await supabase
      .schema('RetificaPremium')
      .from('Veiculos')
      .select('id_veiculos, modelo, placa')
      .in('id_veiculos', ids);
    if (error) throw error;
    vehicles.push(...(data ?? []));
  }

  const relCounts = new Map();
  const noteIds = notes.map((note) => note.id_notas_servico);
  for (let i = 0; i < noteIds.length; i += 100) {
    const ids = noteIds.slice(i, i + 100);
    const { data, error } = await supabase
      .schema('RetificaPremium')
      .from('Rel_NotaS_Serv')
      .select('fk_notas_servico')
      .in('fk_notas_servico', ids);
    if (error) throw error;
    for (const row of data ?? []) {
      relCounts.set(row.fk_notas_servico, (relCounts.get(row.fk_notas_servico) ?? 0) + 1);
    }
  }

  return { notes, clients, vehicles, statuses, relCounts };
}

async function verifyStoragePaths(notes) {
  const storagePaths = notes.map((note) => cleanText(note.pdf_url)).filter(isStoragePath);
  const uniquePaths = [...new Set(storagePaths)];
  const existing = new Set();
  const failed = new Map();

  if (!VERIFY_STORAGE) return { existing, failed, skipped: true };

  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from('notas').createSignedUrls(chunk, 60);
    if (error) {
      for (const storagePath of chunk) failed.set(storagePath, error.message);
      continue;
    }

    for (let j = 0; j < chunk.length; j += 1) {
      if (data?.[j]?.signedUrl) existing.add(chunk[j]);
      else failed.set(chunk[j], data?.[j]?.error ?? 'signed_url_missing');
    }
  }

  return { existing, failed, skipped: false };
}

function legacyIndexes(snapshot) {
  const clientsById = new Map(snapshot.clients.map((row) => [String(row.id_cliente), row]));
  const vehiclesById = new Map(snapshot.vehicles.map((row) => [String(row.id_veiculo), row]));
  const vehiclesByClientId = groupBy(snapshot.vehicles, (row) => String(row.cliente_id ?? ''));
  const itemsByServiceId = groupBy(snapshot.items, (row) => String(row.servico_id ?? ''));
  const activeServices = snapshot.services.filter((service) => !isDeletedLegacy(service));
  const exactCounts = groupBy(activeServices, (service) => normalizeOsExact(service.os));
  const numericCounts = groupBy(activeServices, (service) => normalizeOsNumber(service.os));

  return {
    clientsById,
    vehiclesById,
    vehiclesByClientId,
    itemsByServiceId,
    exactCounts,
    numericCounts,
  };
}

function supabaseIndexes(snapshot) {
  return {
    clientsById: new Map(snapshot.clients.map((row) => [row.id_clientes, row])),
    vehiclesById: new Map(snapshot.vehicles.map((row) => [row.id_veiculos, row])),
    statusesById: new Map(snapshot.statuses.map((row) => [row.id_status_notas, row])),
    notesByExact: groupBy(snapshot.notes, (note) => normalizeOsExact(note.os)),
    notesByNumeric: groupBy(snapshot.notes, (note) => normalizeOsNumber(note.os)),
  };
}

function itemTotal(items) {
  return items.reduce((sum, item) => {
    const quantity = Math.max(0, toNumber(item.quantidade, 0));
    const value = Math.max(0, toNumber(item.valor_unitario, 0));
    const discount = Math.min(100, Math.max(0, toNumber(item.desconto_item, 0)));
    return sum + (quantity * value * (1 - discount / 100));
  }, 0);
}

function resolveLegacyVehicle(service, indexes, clientId) {
  const vehicleId = pickFirst(service, ['veiculo_id', 'fk_veiculo', 'id_veiculo']);
  return indexes.vehiclesById.get(String(vehicleId))
    ?? (indexes.vehiclesByClientId.get(String(clientId ?? '')) ?? [])[0]
    ?? null;
}

function resolveMatch(service, currentIndexes, legacyIndexes) {
  const exact = normalizeOsExact(service.os);
  const numeric = normalizeOsNumber(service.os);
  const exactMatches = currentIndexes.notesByExact.get(exact) ?? [];
  if (exactMatches.length > 0) return { type: 'exact', matches: exactMatches };

  const numericMatches = numeric ? currentIndexes.notesByNumeric.get(numeric) ?? [] : [];
  const legacyNumericMatches = numeric ? legacyIndexes.numericCounts.get(numeric) ?? [] : [];
  if (numericMatches.length === 1 && legacyNumericMatches.length === 1) {
    return { type: 'numeric', matches: numericMatches };
  }
  if (numericMatches.length > 0) {
    return { type: 'numeric_conflict', matches: numericMatches };
  }

  return { type: 'none', matches: [] };
}

function buildRow({
  category,
  matchType,
  legacyService,
  legacyClient,
  legacyVehicle,
  legacyItems = [],
  newNote,
  newClient,
  newVehicle,
  status,
  newItemsCount,
  storage,
  notes,
}) {
  const legacyTotal = toNumber(legacyService?.valor_total, 0);
  const newTotal = newNote ? toNumber(newNote.total, 0) : null;
  const pdfPath = cleanText(newNote?.pdf_url);
  let storageStatus = '';
  if (pdfPath && isStoragePath(pdfPath)) {
    storageStatus = storage.skipped ? 'not_checked' : (storage.existing.has(pdfPath) ? 'ok' : 'missing');
  } else if (pdfPath) {
    storageStatus = /^https?:\/\//i.test(pdfPath) ? 'external_url' : 'non_storage';
  }

  return {
    category,
    legacy_os: normalizeOsExact(legacyService?.os),
    new_os: normalizeOsExact(newNote?.os),
    match_type: matchType,
    legacy_id: legacyService?.id_servico ?? '',
    new_id: newNote?.id_notas_servico ?? '',
    legacy_created_at: toIso(legacyService?.created_at),
    new_created_at: toIso(newNote?.created_at),
    legacy_client: cleanText(legacyClient?.nome),
    new_client: cleanText(newClient?.nome),
    legacy_document: digits(legacyClient?.documento),
    new_document: digits(newClient?.documento),
    legacy_vehicle: cleanText(legacyVehicle?.veiculo ?? legacyVehicle?.modelo),
    new_vehicle: cleanText(newVehicle?.modelo),
    legacy_plate: cleanText(legacyVehicle?.placa),
    new_plate: cleanText(newVehicle?.placa),
    legacy_total: legacyTotal,
    new_total: newTotal ?? '',
    total_delta: newTotal === null ? '' : Number((newTotal - legacyTotal).toFixed(2)),
    legacy_items: legacyItems.length,
    new_items: newNote ? newItemsCount : '',
    legacy_items_total: Number(itemTotal(legacyItems).toFixed(2)),
    new_status: cleanText(status?.nome),
    new_payment_status: cleanText(newNote?.payment_status),
    new_origem: cleanText(newNote?.origem),
    legacy_pdf_present: Boolean(cleanText(legacyService?.s3_link)),
    new_pdf_url: pdfPath,
    new_pdf_storage_status: storageStatus,
    notes: notes.join(' | '),
  };
}

async function main() {
  const [legacySnapshot, owner] = await Promise.all([
    loadLegacySnapshot(),
    getTargetOwner(),
  ]);
  const newSnapshot = await loadSupabaseSnapshot(owner);
  const storage = await verifyStoragePaths(newSnapshot.notes);
  const legacy = legacyIndexes(legacySnapshot);
  const current = supabaseIndexes(newSnapshot);

  const matchedNewIds = new Set();
  const deparaRows = [];
  const missingRows = [];
  const duplicateRows = [];
  const mismatchRows = [];

  for (const service of legacySnapshot.services) {
    const legacyClientId = String(pickFirst(service, ['cliente_id', 'fk_cliente', 'id_cliente']) ?? '');
    const legacyClient = legacy.clientsById.get(legacyClientId) ?? null;
    const legacyVehicle = resolveLegacyVehicle(service, legacy, legacyClientId);
    const legacyItems = legacy.itemsByServiceId.get(String(service.id_servico)) ?? [];
    const legacyOs = normalizeOsExact(service.os);
    const legacyNumeric = normalizeOsNumber(service.os);
    const notes = [];

    if (isDeletedLegacy(service)) {
      const row = buildRow({
        category: 'legacy_deleted',
        matchType: 'ignored',
        legacyService: service,
        legacyClient,
        legacyVehicle,
        legacyItems,
        storage,
        notes: ['Excluida no legado; nao precisa existir no novo.'],
      });
      deparaRows.push(row);
      continue;
    }

    const legacyExactDuplicates = legacy.exactCounts.get(legacyOs) ?? [];
    const legacyNumericDuplicates = legacyNumeric ? legacy.numericCounts.get(legacyNumeric) ?? [] : [];
    if (legacyExactDuplicates.length > 1) {
      notes.push('O.S. duplicada exatamente no legado; precisa revisao humana antes de importacao automatica.');
    } else if (legacyNumericDuplicates.length > 1) {
      notes.push('Mesmo numero de O.S. aparece em mais de um formato no legado; match numerico nao e seguro.');
    }

    const match = resolveMatch(service, current, legacy);
    if (match.matches.length === 0) {
      const category = notes.length > 0 ? 'legacy_duplicate_pending' : 'missing_in_new';
      const row = buildRow({
        category,
        matchType: 'none',
        legacyService: service,
        legacyClient,
        legacyVehicle,
        legacyItems,
        storage,
        notes,
      });
      deparaRows.push(row);
      if (category === 'missing_in_new') missingRows.push(row);
      else duplicateRows.push(row);
      continue;
    }

    if (match.type === 'numeric_conflict') {
      const row = buildRow({
        category: 'numeric_conflict_unmatched',
        matchType: match.type,
        legacyService: service,
        legacyClient,
        legacyVehicle,
        legacyItems,
        storage,
        notes: [
          ...notes,
          'Existe O.S. no Retiflow com mesmo numero normalizado, mas o legado/novo nao e unico. Nao validar automaticamente.',
        ],
      });
      deparaRows.push(row);
      duplicateRows.push(row);
      continue;
    }

    if (match.matches.length > 1) {
      const row = buildRow({
        category: 'new_duplicate_conflict',
        matchType: match.type,
        legacyService: service,
        legacyClient,
        legacyVehicle,
        legacyItems,
        storage,
        notes: [...notes, `Mais de uma O.S. no Retiflow corresponde ao mesmo ${match.type}.`],
      });
      deparaRows.push(row);
      duplicateRows.push(row);
      continue;
    }

    const newNote = match.matches[0];
    matchedNewIds.add(newNote.id_notas_servico);
    const newClient = current.clientsById.get(newNote.fk_clientes) ?? null;
    const newVehicle = current.vehiclesById.get(newNote.fk_veiculos) ?? null;
    const status = current.statusesById.get(newNote.fk_status) ?? null;
    const newItemsCount = newSnapshot.relCounts.get(newNote.id_notas_servico) ?? 0;
    const legacyTotal = toNumber(service.valor_total, 0);
    const newTotal = toNumber(newNote.total, 0);
    const warnings = [...notes];

    if (match.type === 'numeric') warnings.push('O.S. encontrada somente por numero normalizado; formato difere.');
    if (Math.abs(newTotal - legacyTotal) > 0.01) warnings.push('Valor total difere.');
    if (legacyItems.length !== newItemsCount) warnings.push('Quantidade de linhas/itens difere.');
    if (digits(legacyClient?.documento) && digits(newClient?.documento) && digits(legacyClient.documento) !== digits(newClient.documento)) {
      warnings.push('Documento do cliente difere.');
    }
    if (!cleanText(newNote.pdf_url)) warnings.push('PDF ausente no Retiflow.');
    if (cleanText(newNote.pdf_url) && isStoragePath(newNote.pdf_url) && !storage.skipped && !storage.existing.has(cleanText(newNote.pdf_url))) {
      warnings.push('PDF referenciado nao foi validado no Storage.');
    }

    const row = buildRow({
      category: warnings.length > 0 ? 'matched_with_warning' : 'matched',
      matchType: match.type,
      legacyService: service,
      legacyClient,
      legacyVehicle,
      legacyItems,
      newNote,
      newClient,
      newVehicle,
      status,
      newItemsCount,
      storage,
      notes: warnings,
    });
    deparaRows.push(row);
    if (warnings.length > 0) mismatchRows.push(row);
  }

  const legacyExactSet = new Set(legacySnapshot.services.map((service) => normalizeOsExact(service.os)).filter(Boolean));
  const legacyNumericSet = new Set(legacySnapshot.services.map((service) => normalizeOsNumber(service.os)).filter(Boolean));
  const newOnlyRows = [];

  for (const note of newSnapshot.notes) {
    if (matchedNewIds.has(note.id_notas_servico)) continue;
    const exact = normalizeOsExact(note.os);
    const numeric = normalizeOsNumber(note.os);
    if (legacyExactSet.has(exact) || (numeric && legacyNumericSet.has(numeric))) continue;

    const newClient = current.clientsById.get(note.fk_clientes) ?? null;
    const newVehicle = current.vehiclesById.get(note.fk_veiculos) ?? null;
    const status = current.statusesById.get(note.fk_status) ?? null;
    newOnlyRows.push(buildRow({
      category: 'new_only',
      matchType: 'new_only',
      newNote: note,
      newClient,
      newVehicle,
      status,
      newItemsCount: newSnapshot.relCounts.get(note.id_notas_servico) ?? 0,
      storage,
      notes: ['Existe apenas no Retiflow; pode ser O.S. criada depois da migracao.'],
    }));
  }

  deparaRows.push(...newOnlyRows);

  const summary = {
    generated_at: new Date().toISOString(),
    mode: 'read_only_depara',
    legacy_company_id: LEGACY_COMPANY_ID,
    target_owner_email: TARGET_OWNER_EMAIL,
    target_owner_id: owner.id_usuarios,
    verify_storage: VERIFY_STORAGE,
    report_dir: REPORT_DIR,
    counts: {
      legacy_total: legacySnapshot.services.length,
      legacy_active: legacySnapshot.services.filter((service) => !isDeletedLegacy(service)).length,
      legacy_deleted: legacySnapshot.services.filter(isDeletedLegacy).length,
      legacy_duplicate_os_groups: [...legacy.exactCounts.values()].filter((rows) => rows.length > 1).length,
      retiflow_total: newSnapshot.notes.length,
      matched_exact: deparaRows.filter((row) => row.category.startsWith('matched') && row.match_type === 'exact').length,
      matched_numeric: deparaRows.filter((row) => row.category.startsWith('matched') && row.match_type === 'numeric').length,
      matched_with_warning: mismatchRows.length,
      missing_in_new: missingRows.length,
      legacy_duplicate_pending: duplicateRows.filter((row) => row.category === 'legacy_duplicate_pending').length,
      numeric_conflict_unmatched: duplicateRows.filter((row) => row.category === 'numeric_conflict_unmatched').length,
      new_duplicate_conflict: duplicateRows.filter((row) => row.category === 'new_duplicate_conflict').length,
      legacy_deleted_rows: deparaRows.filter((row) => row.category === 'legacy_deleted').length,
      new_only: newOnlyRows.length,
      retiflow_pdf_missing: deparaRows.filter((row) => ['matched', 'matched_with_warning'].includes(row.category) && !row.new_pdf_url).length,
      retiflow_storage_pdf_missing: deparaRows.filter((row) => row.new_pdf_storage_status === 'missing').length,
    },
    files: {
      depara: path.join(REPORT_DIR, 'depara-os.csv'),
      missing_in_new: path.join(REPORT_DIR, 'faltantes-no-retiflow.csv'),
      duplicates: path.join(REPORT_DIR, 'duplicidades-e-conflitos.csv'),
      mismatches: path.join(REPORT_DIR, 'divergencias.csv'),
      new_only: path.join(REPORT_DIR, 'apenas-no-retiflow.csv'),
      summary: path.join(REPORT_DIR, 'summary.json'),
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeCsv(summary.files.depara, deparaRows);
  writeCsv(summary.files.missing_in_new, missingRows);
  writeCsv(summary.files.duplicates, duplicateRows);
  writeCsv(summary.files.mismatches, mismatchRows);
  writeCsv(summary.files.new_only, newOnlyRows);
  fs.writeFileSync(summary.files.summary, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[validate-legacy-notes-depara] Falha:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
