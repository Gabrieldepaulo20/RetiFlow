import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const LEGACY_COMPANY_ID = Number(process.env.LEGACY_COMPANY_ID ?? 5);
const TARGET_OWNER_EMAIL = process.env.RETIFLOW_TARGET_OWNER_EMAIL ?? 'retificapremium5@gmail.com';
const LEGACY_CONNECTION_PATH = process.env.LEGACY_CONNECTION_PATH
  ?? '/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas/amplify/backend/function/controledenotas/src/connectionBD.js';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = process.env.REPORT_DIR
  ?? path.join(process.cwd(), 'outputs', 'relatorios', `${TIMESTAMP}-sync-observacoes-legado-retifica-premium`);

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

function normalizeLegacyObservation(value) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

function normalizeForCompare(value) {
  const normalized = normalizeLegacyObservation(value);
  return normalized === null ? '' : normalized.replace(/\s+/g, ' ').trim();
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

function isDeletedLegacy(service) {
  return Number(service.deletado ?? 0) === 1;
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

async function loadLegacyServices() {
  if (!fs.existsSync(LEGACY_CONNECTION_PATH)) {
    throw new Error(`Connection legado nao encontrado: ${LEGACY_CONNECTION_PATH}`);
  }

  const require = createRequire(import.meta.url);
  const { ConnectBD } = require(LEGACY_CONNECTION_PATH);
  const connection = await ConnectBD();

  try {
    const [services] = await connection.query(
      'select id_servico, os, observacoes, deletado, empresa_id, created_at, updated_at from servico where empresa_id = ? order by id_servico asc',
      [LEGACY_COMPANY_ID],
    );
    return services;
  } finally {
    if (typeof connection.end === 'function') await connection.end();
  }
}

async function getTargetOwner() {
  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, nome, email, status')
    .ilike('email', TARGET_OWNER_EMAIL)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id_usuarios || data.status === false) {
    throw new Error(`Conta destino ativa nao encontrada para ${TARGET_OWNER_EMAIL}.`);
  }
  return data;
}

async function loadRetiflowNotes(ownerId) {
  return fetchAll(() => supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select('id_notas_servico, os, observacoes, origem, created_at, updated_at')
    .eq('criado_por_usuario', ownerId)
    .order('created_at', { ascending: true }));
}

function resolveMatch(service, notesByExact, notesByNumeric, legacyNumericCounts) {
  const exactMatches = notesByExact.get(normalizeOsExact(service.os)) ?? [];
  if (exactMatches.length === 1) return { type: 'exact', note: exactMatches[0], conflict: false };
  if (exactMatches.length > 1) return { type: 'exact_conflict', note: null, conflict: true };

  const numeric = normalizeOsNumber(service.os);
  const numericMatches = numeric ? notesByNumeric.get(numeric) ?? [] : [];
  const legacyNumericMatches = numeric ? legacyNumericCounts.get(numeric) ?? [] : [];
  if (numericMatches.length === 1 && legacyNumericMatches.length === 1) {
    return { type: 'numeric_unique', note: numericMatches[0], conflict: false };
  }
  if (numericMatches.length > 0) return { type: 'numeric_conflict', note: null, conflict: true };

  return { type: 'none', note: null, conflict: false };
}

function importedObservationPattern(service) {
  const parts = [];
  const legacyObservation = normalizeLegacyObservation(service.observacoes);
  const solicitanteMarker = 'Solicitante legado:';
  if (legacyObservation) parts.push(legacyObservation);
  parts.push(`Importado da base antiga Retifica Premium. ID legado: ${service.id_servico}.`);
  return { parts, solicitanteMarker };
}

function canUpdateObservation(service, note) {
  const current = normalizeLegacyObservation(note.observacoes);
  const desired = normalizeLegacyObservation(service.observacoes);
  if (normalizeForCompare(current) === normalizeForCompare(desired)) return { allowed: false, reason: 'already_equal' };

  const marker = `Importado da base antiga Retifica Premium. ID legado: ${service.id_servico}.`;
  const currentText = String(note.observacoes ?? '');
  const imported = importedObservationPattern(service);

  if (!currentText.trim()) return { allowed: true, reason: 'empty_current' };
  if (currentText.includes(marker)) return { allowed: true, reason: 'import_marker' };
  if (currentText.includes(imported.solicitanteMarker)) return { allowed: true, reason: 'solicitante_marker' };
  if (note.origem === 'LEGADO') return { allowed: true, reason: 'legacy_origin' };

  return { allowed: false, reason: 'manual_or_uncertain_current' };
}

async function updateObservation(noteId, observation) {
  const { error } = await supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .update({
      observacoes: observation,
      updated_at: new Date().toISOString(),
    })
    .eq('id_notas_servico', noteId);
  if (error) throw error;
}

async function main() {
  const [legacyServices, owner] = await Promise.all([
    loadLegacyServices(),
    getTargetOwner(),
  ]);
  const notes = await loadRetiflowNotes(owner.id_usuarios);
  const activeLegacyServices = legacyServices.filter((service) => !isDeletedLegacy(service));
  const notesByExact = groupBy(notes, (note) => normalizeOsExact(note.os));
  const notesByNumeric = groupBy(notes, (note) => normalizeOsNumber(note.os));
  const legacyNumericCounts = groupBy(activeLegacyServices, (service) => normalizeOsNumber(service.os));

  const rows = [];
  const updates = [];
  const failures = [];

  for (const service of legacyServices) {
    if (isDeletedLegacy(service)) {
      rows.push({
        action: 'skipped',
        reason: 'deleted_legacy',
        match_type: '',
        legacy_id: service.id_servico,
        legacy_os: normalizeOsExact(service.os),
        note_id: '',
        note_os: '',
        desired_length: 0,
        current_length: 0,
      });
      continue;
    }

    const match = resolveMatch(service, notesByExact, notesByNumeric, legacyNumericCounts);
    if (!match.note) {
      rows.push({
        action: 'skipped',
        reason: match.conflict ? match.type : 'missing_in_retiflow',
        match_type: match.type,
        legacy_id: service.id_servico,
        legacy_os: normalizeOsExact(service.os),
        note_id: '',
        note_os: '',
        desired_length: String(normalizeLegacyObservation(service.observacoes) ?? '').length,
        current_length: 0,
      });
      continue;
    }

    const decision = canUpdateObservation(service, match.note);
    const desired = normalizeLegacyObservation(service.observacoes);
    const row = {
      action: decision.allowed ? (APPLY ? 'updated' : 'would_update') : 'skipped',
      reason: decision.reason,
      match_type: match.type,
      legacy_id: service.id_servico,
      legacy_os: normalizeOsExact(service.os),
      note_id: match.note.id_notas_servico,
      note_os: normalizeOsExact(match.note.os),
      desired_length: String(desired ?? '').length,
      current_length: String(match.note.observacoes ?? '').length,
    };

    if (decision.allowed) {
      if (APPLY) {
        try {
          await updateObservation(match.note.id_notas_servico, desired);
          updates.push(row);
        } catch (error) {
          row.action = 'failed';
          row.reason = error instanceof Error ? error.message : String(error);
          failures.push(row);
        }
      } else {
        updates.push(row);
      }
    }
    rows.push(row);
  }

  const counters = rows.reduce((acc, row) => {
    const key = `${row.action}:${row.reason}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    legacy_company_id: LEGACY_COMPANY_ID,
    target_owner_email: TARGET_OWNER_EMAIL,
    target_owner_id: owner.id_usuarios,
    counters,
    totals: {
      legacy_services: legacyServices.length,
      active_legacy_services: activeLegacyServices.length,
      retiflow_notes: notes.length,
      planned_or_applied_updates: updates.length,
      failures: failures.length,
    },
    report_dir: REPORT_DIR,
    files: {
      rows: path.join(REPORT_DIR, 'observacoes-depara.csv'),
      summary: path.join(REPORT_DIR, 'summary.json'),
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeCsv(summary.files.rows, rows);
  fs.writeFileSync(summary.files.summary, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[sync-legacy-note-observations] Falha:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
