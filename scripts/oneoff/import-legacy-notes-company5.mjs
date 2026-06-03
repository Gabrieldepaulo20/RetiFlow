import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const LEGACY_COMPANY_ID = Number(process.env.LEGACY_COMPANY_ID ?? 5);
const LEGACY_CONNECTION_PATH = process.env.LEGACY_CONNECTION_PATH
  ?? '/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas/amplify/backend/function/controledenotas/src/connectionBD.js';
const TARGET_OWNER_ID = process.env.RETIFLOW_TARGET_OWNER_ID ?? null;
const TARGET_OWNER_NAME = process.env.RETIFLOW_TARGET_OWNER_NAME ?? 'Retífica Premium';
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'legacy-notes-company5-import-result.json');
const LIMIT = Number(process.env.LEGACY_IMPORT_LIMIT ?? 0);

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

function normalizePlate(value) {
  const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized || null;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSmallIntQuantity(value) {
  const n = Math.round(toNumber(value, 1));
  return Math.min(32767, Math.max(1, n));
}

function normalizeDiscount(value) {
  return Math.min(100, Math.max(0, toNumber(value, 0)));
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pickFirst(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
      return row[name];
    }
  }
  return null;
}

async function getTargetOwner() {
  let query = supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, status');

  if (TARGET_OWNER_ID) {
    query = query.eq('id_usuarios', TARGET_OWNER_ID);
  } else {
    query = query.ilike('nome', TARGET_OWNER_NAME);
  }

  const { data, error } = await query;
  if (error) throw error;
  const active = (data ?? []).filter((row) => row.status !== false);
  if (active.length !== 1) {
    throw new Error(`Conta destino ambigua ou ausente para "${TARGET_OWNER_ID ?? TARGET_OWNER_NAME}". Encontradas: ${active.length}.`);
  }
  return active[0];
}

async function getInitialStatusId() {
  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Status_Notas')
    .select('id_status_notas')
    .eq('tipo_nota', 'Serviço')
    .eq('tipo_status', 'ativo')
    .order('index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id_status_notas) throw new Error('Status inicial de O.S. nao encontrado.');
  return data.id_status_notas;
}

async function getMotorId(tipo = 'Não Identificado') {
  const motor = cleanText(tipo) || 'Não Identificado';
  const { data: existing, error: readError } = await supabase
    .schema('RetificaPremium')
    .from('Tipos_de_Motor')
    .select('id_tipos_de_motor, tipo')
    .ilike('tipo', motor)
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.id_tipos_de_motor) return existing.id_tipos_de_motor;

  if (!APPLY) return null;

  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Tipos_de_Motor')
    .insert({ tipo: motor })
    .select('id_tipos_de_motor')
    .single();
  if (error) throw error;
  return data.id_tipos_de_motor;
}

async function loadDestination(ownerId) {
  const [clientsResult, notesResult, servicesResult, vehiclesResult] = await Promise.all([
    supabase.schema('RetificaPremium').from('Clientes').select('id_clientes, documento').eq('fk_criado_por', ownerId),
    supabase.schema('RetificaPremium').from('Notas_de_Servico').select('id_notas_servico, os').eq('criado_por_usuario', ownerId),
    supabase.schema('RetificaPremium').from('Servicos_ou_Itens').select('id_servicos_itens, nome'),
    supabase.schema('RetificaPremium').from('Veiculos').select('id_veiculos, placa').not('placa', 'is', null),
  ]);

  for (const result of [clientsResult, notesResult, servicesResult, vehiclesResult]) {
    if (result.error) throw result.error;
  }

  return {
    clientsByDocument: new Map((clientsResult.data ?? []).map((row) => [digits(row.documento), row.id_clientes])),
    existingOs: new Set((notesResult.data ?? []).map((row) => cleanText(row.os)).filter(Boolean)),
    servicesByName: new Map((servicesResult.data ?? []).map((row) => [cleanText(row.nome).toLowerCase(), row.id_servicos_itens])),
    vehiclesByPlate: new Map((vehiclesResult.data ?? []).map((row) => [normalizePlate(row.placa), row.id_veiculos]).filter(([plate]) => plate)),
  };
}

async function loadLegacySnapshot() {
  if (!fs.existsSync(LEGACY_CONNECTION_PATH)) {
    throw new Error(`Connection legado nao encontrado: ${LEGACY_CONNECTION_PATH}`);
  }

  const require = createRequire(import.meta.url);
  const { ConnectBD } = require(LEGACY_CONNECTION_PATH);
  const connection = await ConnectBD();
  try {
    const serviceSql = [
      'select * from servico where empresa_id = ? order by id_servico asc',
      LIMIT > 0 ? `limit ${LIMIT}` : '',
    ].filter(Boolean).join(' ');
    const [services] = await connection.query(serviceSql, [LEGACY_COMPANY_ID]);
    const [clients] = await connection.query('select * from cliente where empresa_id = ?', [LEGACY_COMPANY_ID]);
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

function indexLegacy(snapshot) {
  const clientsById = new Map(snapshot.clients.map((row) => [String(row.id_cliente), row]));
  const vehiclesById = new Map(snapshot.vehicles.map((row) => [String(row.id_veiculo), row]));
  const vehiclesByClientId = new Map();
  for (const vehicle of snapshot.vehicles) {
    const key = String(vehicle.cliente_id ?? '');
    if (!vehiclesByClientId.has(key)) vehiclesByClientId.set(key, []);
    vehiclesByClientId.get(key).push(vehicle);
  }

  const itemsByServiceId = new Map();
  for (const item of snapshot.items) {
    const key = String(item.servico_id ?? '');
    if (!itemsByServiceId.has(key)) itemsByServiceId.set(key, []);
    itemsByServiceId.get(key).push(item);
  }

  const osCounts = new Map();
  for (const service of snapshot.services) {
    const os = cleanText(service.os);
    if (os) osCounts.set(os, (osCounts.get(os) ?? 0) + 1);
  }

  return { clientsById, vehiclesById, vehiclesByClientId, itemsByServiceId, osCounts };
}

async function ensureVehicle(legacyVehicle, destination, createdVehicleByLegacyId, motorId) {
  const legacyId = String(pickFirst(legacyVehicle, ['id_veiculo', 'id', 'veiculo_id']) ?? '');
  if (createdVehicleByLegacyId.has(legacyId)) return createdVehicleByLegacyId.get(legacyId);

  const placa = normalizePlate(legacyVehicle?.placa);
  if (placa && destination.vehiclesByPlate.has(placa)) {
    const existingId = destination.vehiclesByPlate.get(placa);
    createdVehicleByLegacyId.set(legacyId, existingId);
    return existingId;
  }

  const payload = {
    modelo: cleanText(legacyVehicle?.veiculo ?? legacyVehicle?.modelo) || 'Não Identificado',
    placa,
    km: Math.max(0, Math.round(toNumber(legacyVehicle?.km ?? legacyVehicle?.quilometragem, 0))),
    fk_tipos_de_motor: motorId,
  };

  if (!APPLY) return null;

  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Veiculos')
    .insert(payload)
    .select('id_veiculos, placa')
    .single();
  if (error) throw error;

  createdVehicleByLegacyId.set(legacyId, data.id_veiculos);
  if (data.placa) destination.vehiclesByPlate.set(normalizePlate(data.placa), data.id_veiculos);
  return data.id_veiculos;
}

async function ensureServiceItem(description, destination) {
  const nome = cleanText(description);
  const key = nome.toLowerCase();
  if (destination.servicesByName.has(key)) return destination.servicesByName.get(key);

  if (!APPLY) return null;

  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Servicos_ou_Itens')
    .insert({ nome })
    .select('id_servicos_itens')
    .single();
  if (error) throw error;
  destination.servicesByName.set(key, data.id_servicos_itens);
  return data.id_servicos_itens;
}

function buildObservations(service) {
  const chunks = [];
  const solicitante = cleanText(service.solicitante);
  const observacoes = cleanText(service.observacoes);
  if (solicitante) chunks.push(`Solicitante legado: ${solicitante}`);
  if (observacoes) chunks.push(observacoes);
  chunks.push(`Importado da base antiga Retifica Premium. ID legado: ${service.id_servico}.`);
  return chunks.join('\n');
}

async function importNote({ service, client, vehicle, items, ownerId, statusId, destination, createdVehicleByLegacyId, motorId }) {
  const vehicleId = await ensureVehicle(vehicle, destination, createdVehicleByLegacyId, motorId);
  const clientId = destination.clientsByDocument.get(digits(client.documento));
  const total = toNumber(service.valor_total, 0);
  const createdAt = toIsoOrNull(service.created_at);
  const updatedAt = toIsoOrNull(service.updated_at);
  const fallbackPrazo = createdAt ?? new Date().toISOString();
  const prazo = toIsoOrNull(service.prazo_entrega) ?? toIsoOrNull(service.data_entrada) ?? fallbackPrazo;

  if (!APPLY) return { noteId: null, insertedItems: items.length };

  let noteId = null;
  try {
    const notePayload = {
      os: cleanText(service.os),
      prazo,
      defeito: '-',
      observacoes: buildObservations(service),
      fk_clientes: clientId,
      fk_veiculos: vehicleId,
      fk_status: statusId,
      criado_por_usuario: ownerId,
      total_servicos: total,
      total_produtos: 0,
      total,
      pdf_url: cleanText(service.s3_link) || null,
      pdf_formato: cleanText(service.s3_link) ? 'legacy_s3' : null,
    };
    if (createdAt) notePayload.created_at = createdAt;
    if (updatedAt) notePayload.updated_at = updatedAt;

    const { data: note, error: noteError } = await supabase
      .schema('RetificaPremium')
      .from('Notas_de_Servico')
      .insert(notePayload)
      .select('id_notas_servico')
      .single();
    if (noteError) throw noteError;
    noteId = note.id_notas_servico;

    const relRows = [];
    for (const item of items) {
      const descricao = cleanText(item.descricao);
      if (!descricao) continue;
      const serviceItemId = await ensureServiceItem(descricao, destination);
      relRows.push({
        fk_notas_servico: noteId,
        fk_servicos_itens: serviceItemId,
        quantidade: toSmallIntQuantity(item.quantidade),
        valor: Math.max(0, toNumber(item.valor_unitario, 0)),
        desconto: normalizeDiscount(item.desconto_item),
        detalhes: null,
      });
      const itemCreatedAt = toIsoOrNull(item.created_at);
      const itemUpdatedAt = toIsoOrNull(item.updated_at);
      if (itemCreatedAt) relRows[relRows.length - 1].created_at = itemCreatedAt;
      if (itemUpdatedAt) relRows[relRows.length - 1].updated_at = itemUpdatedAt;
    }

    if (relRows.length > 0) {
      const { error: relError } = await supabase
        .schema('RetificaPremium')
        .from('Rel_NotaS_Serv')
        .insert(relRows);
      if (relError) throw relError;
    }

    destination.existingOs.add(cleanText(service.os));
    return { noteId, insertedItems: relRows.length };
  } catch (error) {
    if (noteId) {
      await supabase.schema('RetificaPremium').from('Rel_NotaS_Serv').delete().eq('fk_notas_servico', noteId);
      await supabase.schema('RetificaPremium').from('Notas_de_Servico').delete().eq('id_notas_servico', noteId);
    }
    throw error;
  }
}

async function main() {
  const owner = await getTargetOwner();
  const statusId = await getInitialStatusId();
  const motorId = await getMotorId();
  if (APPLY && !motorId) throw new Error('Motor padrao nao encontrado/criado.');

  const [legacySnapshot, destination] = await Promise.all([
    loadLegacySnapshot(),
    loadDestination(owner.id_usuarios),
  ]);
  const legacy = indexLegacy(legacySnapshot);
  const createdVehicleByLegacyId = new Map();

  const counters = {
    source_notes: legacySnapshot.services.length,
    inserted_notes: 0,
    inserted_items: 0,
    skipped_deleted: 0,
    skipped_duplicate_legacy_os: 0,
    skipped_existing_os: 0,
    skipped_missing_client: 0,
    skipped_missing_vehicle: 0,
    skipped_missing_items: 0,
    failed: 0,
  };
  const failures = [];

  for (const service of legacySnapshot.services) {
    const os = cleanText(service.os);
    if (Number(service.deletado ?? 0) === 1) {
      counters.skipped_deleted += 1;
      continue;
    }
    if (!os || (legacy.osCounts.get(os) ?? 0) > 1) {
      counters.skipped_duplicate_legacy_os += 1;
      continue;
    }
    if (destination.existingOs.has(os)) {
      counters.skipped_existing_os += 1;
      continue;
    }

    const legacyClientId = String(pickFirst(service, ['cliente_id', 'fk_cliente', 'id_cliente']) ?? '');
    const client = legacy.clientsById.get(legacyClientId);
    if (!client || !destination.clientsByDocument.has(digits(client.documento))) {
      counters.skipped_missing_client += 1;
      continue;
    }

    const legacyVehicleId = pickFirst(service, ['veiculo_id', 'fk_veiculo', 'id_veiculo']);
    const vehicle = legacy.vehiclesById.get(String(legacyVehicleId))
      ?? (legacy.vehiclesByClientId.get(legacyClientId) ?? [])[0]
      ?? null;
    if (!vehicle || (!cleanText(vehicle.veiculo ?? vehicle.modelo) && !normalizePlate(vehicle.placa))) {
      counters.skipped_missing_vehicle += 1;
      continue;
    }

    const items = legacy.itemsByServiceId.get(String(service.id_servico)) ?? [];
    if (items.length === 0) {
      counters.skipped_missing_items += 1;
      continue;
    }

    try {
      const result = await importNote({
        service,
        client,
        vehicle,
        items,
        ownerId: owner.id_usuarios,
        statusId,
        destination,
        createdVehicleByLegacyId,
        motorId,
      });
      counters.inserted_notes += APPLY ? 1 : 0;
      counters.inserted_items += APPLY ? result.insertedItems : 0;
    } catch (error) {
      counters.failed += 1;
      failures.push({
        legacy_servico_id: service.id_servico,
        os,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    legacy_company_id: LEGACY_COMPANY_ID,
    target_owner: {
      id: owner.id_usuarios,
      nome: owner.nome,
    },
    planned_notes: counters.source_notes
      - counters.skipped_deleted
      - counters.skipped_duplicate_legacy_os
      - counters.skipped_existing_os
      - counters.skipped_missing_client
      - counters.skipped_missing_vehicle
      - counters.skipped_missing_items,
    counters,
    failures,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[import-legacy-notes] Falha:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
