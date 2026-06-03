import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'notas';
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'duplicate-service-orders-cleanup.json');

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

function numericOs(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return String(BigInt(digits));
}

function isStoragePath(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('blob:');
}

function compareKeepOrder(a, b) {
  const aDate = Date.parse(a.created_at ?? '') || 0;
  const bDate = Date.parse(b.created_at ?? '') || 0;
  if (aDate !== bDate) return bDate - aDate;
  return String(b.id_notas_servico).localeCompare(String(a.id_notas_servico));
}

function groupNotes(notes) {
  const groups = new Map();

  for (const note of notes) {
    const osNumber = numericOs(note.os);
    if (!note.criado_por_usuario || osNumber === null) continue;
    const key = `${note.criado_por_usuario}::${osNumber}`;
    const group = groups.get(key) ?? {
      key,
      criado_por_usuario: note.criado_por_usuario,
      os_numero: osNumber,
      notes: [],
    };
    group.notes.push(note);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.notes.length > 1)
    .map((group) => {
      const ordered = [...group.notes].sort(compareKeepOrder);
      return {
        criado_por_usuario: group.criado_por_usuario,
        os_numero: group.os_numero,
        kept: ordered[0],
        deleted: ordered.slice(1),
      };
    })
    .sort((a, b) => Number(a.os_numero) - Number(b.os_numero));
}

async function loadNotes() {
  const { data, error } = await supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select(`
      id_notas_servico,
      criado_por_usuario,
      os,
      fk_clientes,
      created_at,
      pdf_url,
      Clientes:fk_clientes(nome)
    `)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((note) => ({
    ...note,
    cliente_nome: note.Clientes?.nome ?? null,
  }));
}

async function deleteRows(table, column, ids) {
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .schema('RetificaPremium')
    .from(table)
    .delete({ count: 'exact' })
    .in(column, ids);
  if (error) throw new Error(`[${table}] ${error.message}`);
  return count ?? 0;
}

async function nullifyFaturas(noteIds) {
  if (noteIds.length === 0) return 0;
  const { count, error } = await supabase
    .schema('RetificaPremium')
    .from('Faturas')
    .update({ fk_notas_servico: null }, { count: 'exact' })
    .in('fk_notas_servico', noteIds);
  if (error) throw new Error(`[Faturas] ${error.message}`);
  return count ?? 0;
}

async function removeStorage(paths) {
  if (paths.length === 0) return { removed: 0, failures: [] };
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    return {
      removed: 0,
      failures: [{ paths, message: error.message }],
    };
  }
  return { removed: data?.length ?? paths.length, failures: [] };
}

function slimNote(note) {
  return {
    id: note.id_notas_servico,
    os: note.os,
    cliente: note.cliente_nome,
    created_at: note.created_at,
    pdf_url: note.pdf_url,
  };
}

async function main() {
  const notes = await loadNotes();
  const groups = groupNotes(notes);
  const doomed = groups.flatMap((group) => group.deleted);
  const doomedIds = doomed.map((note) => note.id_notas_servico);
  const storagePaths = [...new Set(doomed.map((note) => note.pdf_url).filter(isStoragePath))];

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    policy: 'keep newest created_at per owner and numeric OS; delete older duplicates',
    duplicate_groups: groups.length,
    notes_to_delete: doomed.length,
    storage_paths_to_remove: storagePaths.length,
    groups: groups.map((group) => ({
      criado_por_usuario: group.criado_por_usuario,
      os_numero: group.os_numero,
      kept: slimNote(group.kept),
      deleted: group.deleted.map(slimNote),
    })),
    applied: null,
  };

  if (APPLY && doomedIds.length > 0) {
    const faturasNullified = await nullifyFaturas(doomedIds);
    const notasCompraDeleted = await deleteRows('Notas_de_Compra', 'fk_notas_servico', doomedIds);
    const relItemsDeleted = await deleteRows('Rel_NotaS_Serv', 'fk_notas_servico', doomedIds);
    const notasDeleted = await deleteRows('Notas_de_Servico', 'id_notas_servico', doomedIds);
    const storage = await removeStorage(storagePaths);

    report.applied = {
      faturas_nullified: faturasNullified,
      notas_compra_deleted: notasCompraDeleted,
      rel_items_deleted: relItemsDeleted,
      notas_deleted: notasDeleted,
      storage_removed: storage.removed,
      storage_failures: storage.failures,
    };
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mode: report.mode,
    duplicate_groups: report.duplicate_groups,
    notes_to_delete: report.notes_to_delete,
    storage_paths_to_remove: report.storage_paths_to_remove,
    applied: report.applied,
    report_path: REPORT_PATH,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
