import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const LEGACY_COMPANY_ID = Number(process.env.LEGACY_COMPANY_ID ?? 5);
const LEGACY_CONNECTION_PATH = process.env.LEGACY_CONNECTION_PATH
  ?? '/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas/amplify/backend/function/controledenotas/src/connectionBD.js';
const LEGACY_AMPLIFY_CONFIG_PATH = process.env.LEGACY_AMPLIFY_CONFIG_PATH
  ?? '/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas/src/amplifyconfiguration.json';
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'legacy-notes-company5-report.json');

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

function loadLegacyAmplifyConfig() {
  if (!fs.existsSync(LEGACY_AMPLIFY_CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(LEGACY_AMPLIFY_CONFIG_PATH, 'utf8'));
}

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

function maskEmail(email) {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return null;
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

function pickFirst(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
      return row[name];
    }
  }
  return null;
}

async function listColumns(connection, tableName) {
  try {
    const [rows] = await connection.query(`show columns from \`${tableName}\``);
    return rows.map((row) => row.Field);
  } catch {
    return [];
  }
}

async function hasTable(connection, tableName) {
  const [rows] = await connection.query('show tables like ?', [tableName]);
  return rows.length > 0;
}

async function queryIfTableExists(connection, tableName, sql, params = []) {
  if (!(await hasTable(connection, tableName))) return [];
  const [rows] = await connection.query(sql, params);
  return rows;
}

async function fetchLegacyPdfLink(endpoint, os) {
  if (!endpoint || !os) return { status: 'skipped', link: null };
  const url = new URL('/servico/pdf-link', endpoint);
  url.searchParams.set('empresaId', String(LEGACY_COMPANY_ID));
  url.searchParams.set('os', String(os));

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return { status: `http_${response.status}`, link: null };
    const data = await response.json();
    return { status: data?.s3_link ? 'ok' : 'missing', link: data?.s3_link ?? null };
  } catch (error) {
    return { status: 'error', link: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkPdfReachable(url) {
  if (!url || !/^https?:\/\//i.test(url)) return { status: 'skipped' };
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return { status: response.ok ? 'ok' : `http_${response.status}` };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

async function buildSupabaseSnapshot() {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    return { available: false, reason: 'Supabase service env ausente.' };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targetOwnerEmail = cleanText(env.RETIFLOW_TARGET_OWNER_EMAIL).toLowerCase();
  let ownerId = null;
  if (targetOwnerEmail) {
    const { data, error } = await supabase
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios, email')
      .ilike('email', targetOwnerEmail)
      .maybeSingle();
    if (error) throw error;
    ownerId = data?.id_usuarios ?? null;
  }

  const clientsQuery = supabase
    .schema('RetificaPremium')
    .from('Clientes')
    .select('id_clientes, nome, documento, fk_criado_por');
  if (ownerId) clientsQuery.eq('fk_criado_por', ownerId);
  const { data: clients, error: clientsError } = await clientsQuery;
  if (clientsError) throw clientsError;

  const notesQuery = supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select('id_notas_servico, os, fk_clientes, fk_veiculos, criado_por_usuario, pdf_url');
  if (ownerId) notesQuery.eq('criado_por_usuario', ownerId);
  const { data: notes, error: notesError } = await notesQuery;
  if (notesError) throw notesError;

  return {
    available: true,
    ownerId,
    clients: clients ?? [],
    notes: notes ?? [],
  };
}

function classifyNote({ note, client, vehicle, items, existingOs, duplicateLegacyOs, pdf }) {
  const reasons = [];
  if (existingOs) reasons.push('duplicada');
  if (duplicateLegacyOs) reasons.push('duplicada_legado');
  if (!client || (!cleanText(client.nome) && !digits(client.documento))) reasons.push('sem_cliente');
  if (!vehicle || (!cleanText(vehicle.modelo) && !normalizePlate(vehicle.placa))) reasons.push('sem_veiculo');
  if (!items || items.length === 0) reasons.push('sem_itens');
  if (!pdf.link) reasons.push('sem_pdf');

  if (reasons.includes('duplicada')) return 'duplicada';
  if (reasons.includes('sem_cliente')) return 'sem_cliente';
  if (reasons.includes('sem_veiculo')) return 'sem_veiculo';
  if (reasons.includes('sem_itens')) return 'sem_itens';
  if (reasons.includes('sem_pdf')) return 'sem_pdf';
  if (reasons.length > 0) return 'pendente';
  return 'migravel';
}

async function main() {
  if (!fs.existsSync(LEGACY_CONNECTION_PATH)) {
    throw new Error(`Connection legado nao encontrado: ${LEGACY_CONNECTION_PATH}`);
  }

  const require = createRequire(import.meta.url);
  const { ConnectBD } = require(LEGACY_CONNECTION_PATH);
  const legacyConfig = loadLegacyAmplifyConfig();
  const legacyEndpoint = env.LEGACY_API_ENDPOINT
    ?? legacyConfig.aws_cloud_logic_custom?.find((entry) => entry.name === 'nostasApi')?.endpoint
    ?? null;

  const connection = await ConnectBD();
  try {
    const [serviceRows] = await connection.query(
      'select * from servico where empresa_id = ? order by coalesce(updated_at, created_at) desc',
      [LEGACY_COMPANY_ID],
    );
    const [clientRows] = await connection.query(
      'select * from cliente where empresa_id = ?',
      [LEGACY_COMPANY_ID],
    );
    const vehicleRows = await queryIfTableExists(
      connection,
      'veiculo',
      'select v.* from veiculo v join cliente c on c.id_cliente = v.cliente_id where c.empresa_id = ?',
      [LEGACY_COMPANY_ID],
    );

    const serviceColumns = await listColumns(connection, 'servico');
    const candidateItemTables = ['servico_item', 'servico_itens', 'item_servico', 'itens_servico', 'itens'];
    const existingItemTables = [];
    for (const table of candidateItemTables) {
      if (await hasTable(connection, table)) existingItemTables.push(table);
    }

    const supabaseSnapshot = await buildSupabaseSnapshot();
    const clientsByLegacyId = new Map(clientRows.map((row) => [String(row.id_cliente), row]));
    const vehiclesByClientId = new Map();
    for (const vehicle of vehicleRows) {
      const key = String(vehicle.cliente_id ?? '');
      if (!vehiclesByClientId.has(key)) vehiclesByClientId.set(key, []);
      vehiclesByClientId.get(key).push(vehicle);
    }

    const legacyOsCounts = serviceRows.reduce((map, row) => {
      const os = cleanText(row.os);
      if (!os) return map;
      map.set(os, (map.get(os) ?? 0) + 1);
      return map;
    }, new Map());
    const existingOsSet = new Set(
      supabaseSnapshot.available
        ? supabaseSnapshot.notes.map((row) => cleanText(row.os)).filter(Boolean)
        : [],
    );

    const notes = [];
    for (const service of serviceRows) {
      const os = cleanText(service.os);
      const clientId = String(pickFirst(service, ['cliente_id', 'fk_cliente', 'id_cliente']) ?? '');
      const client = clientsByLegacyId.get(clientId) ?? null;
      const vehicles = vehiclesByClientId.get(clientId) ?? [];
      const vehicle = vehicles[0] ?? null;
      const pdfFromDb = cleanText(service.s3_link);
      const pdfFromApi = pdfFromDb ? { status: 'from_db', link: pdfFromDb } : await fetchLegacyPdfLink(legacyEndpoint, os);
      const pdfHead = await checkPdfReachable(pdfFromApi.link);

      const items = [];
      if (existingItemTables.length > 0) {
        // Mantem inventario conservador: a relacao exata sera revisada no relatorio antes de importacao real.
        items.push({ source: existingItemTables.join(','), status: 'table_present_unmapped' });
      }

      const classification = classifyNote({
        note: service,
        client,
        vehicle,
        items,
        existingOs: existingOsSet.has(os),
        duplicateLegacyOs: (legacyOsCounts.get(os) ?? 0) > 1,
        pdf: pdfFromApi,
      });

      notes.push({
        legacy_servico_id: pickFirst(service, ['id_servico', 'id', 'servico_id']),
        os,
        classification,
        legacy_created_at: pickFirst(service, ['created_at', 'data', 'data_criacao']),
        legacy_updated_at: pickFirst(service, ['updated_at', 'data_atualizacao']),
        client: client ? {
          legacy_id: client.id_cliente,
          nome: cleanText(client.nome),
          documento: digits(client.documento),
          email_masked: maskEmail(client.email),
        } : null,
        vehicle: vehicle ? {
          legacy_id: pickFirst(vehicle, ['id_veiculo', 'id', 'veiculo_id']),
          modelo: cleanText(vehicle.modelo),
          placa: normalizePlate(vehicle.placa),
          km: pickFirst(vehicle, ['km', 'quilometragem']),
        } : null,
        pdf: {
          source: pdfFromDb ? 'servico.s3_link' : 'legacy_api',
          lookup_status: pdfFromApi.status,
          head_status: pdfHead.status,
          has_link: Boolean(pdfFromApi.link),
        },
        flags: {
          os_exists_in_retiflow: existingOsSet.has(os),
          duplicate_legacy_os: (legacyOsCounts.get(os) ?? 0) > 1,
          item_tables_seen: existingItemTables,
        },
      });
    }

    const summary = notes.reduce((acc, note) => {
      acc[note.classification] = (acc[note.classification] ?? 0) + 1;
      return acc;
    }, {});

    const report = {
      generated_at: new Date().toISOString(),
      mode: 'read_only_dry_run',
      legacy_company_id: LEGACY_COMPANY_ID,
      legacy_endpoint_configured: Boolean(legacyEndpoint),
      legacy_s3_bucket_configured: Boolean(legacyConfig.aws_user_files_s3_bucket),
      supabase_snapshot: {
        available: supabaseSnapshot.available,
        owner_scoped: Boolean(supabaseSnapshot.ownerId),
        clients_count: supabaseSnapshot.available ? supabaseSnapshot.clients.length : 0,
        notes_count: supabaseSnapshot.available ? supabaseSnapshot.notes.length : 0,
        reason: supabaseSnapshot.reason,
      },
      legacy_schema_hint: {
        servico_columns: serviceColumns,
        item_tables_seen: existingItemTables,
      },
      totals: {
        legacy_notes: serviceRows.length,
        legacy_clients: clientRows.length,
        legacy_vehicles: vehicleRows.length,
        ...summary,
      },
      notes,
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[dry-run] Relatorio gerado: ${REPORT_PATH}`);
    console.log(JSON.stringify(report.totals, null, 2));
  } finally {
    if (typeof connection.end === 'function') await connection.end();
  }
}

main().catch((error) => {
  console.error('[dry-run] Falha no diagnostico:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
