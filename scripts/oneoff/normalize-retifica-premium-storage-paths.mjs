import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const ONLY_ARG = process.argv.find((arg) => arg.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.split('=')[1] : 'all';
const TARGET_OWNER_NAME = process.env.RETIFLOW_TARGET_OWNER_NAME ?? 'Retífica Premium';
const TARGET_OWNER_ID = process.env.RETIFLOW_TARGET_OWNER_ID ?? null;
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'retifica-premium-storage-normalization.json');
const CONCURRENCY = Math.max(1, Number(process.env.STORAGE_NORMALIZATION_CONCURRENCY ?? 4));

const MONTH_SEGMENTS_PT_BR = [
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

const WEEKDAY_SEGMENTS_PT_BR = [
  'Domingo',
  'Segunda-feira',
  'Terca-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sabado',
];

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

function removeDiacritics(value) {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugifyStorageSegment(value, fallback = 'tenant') {
  const slug = removeDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function storageDateParts(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const dayNumber = String(safeDate.getDate()).padStart(2, '0');
  const weekday = WEEKDAY_SEGMENTS_PT_BR[safeDate.getDay()];
  return {
    year: String(safeDate.getFullYear()),
    month: MONTH_SEGMENTS_PT_BR[safeDate.getMonth()],
    day: `${dayNumber} (${weekday})`,
  };
}

function sanitizeFilename(filename, fallback = 'arquivo') {
  const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
  const basename = removeDiacritics(filename)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
  return `${basename}${extension.toLowerCase()}`;
}

function normalizeOsToken(value, fallback) {
  const token = cleanText(value)
    .replace(/^OS-/i, '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 80);
  return token || fallback;
}

function isStoragePath(value) {
  const pathValue = cleanText(value);
  return Boolean(pathValue)
    && !/^https?:\/\//i.test(pathValue)
    && !pathValue.startsWith('blob:')
    && !pathValue.startsWith('local-upload://');
}

async function getTargetOwner() {
  let query = supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, auth_id, nome, email, status');

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

function desiredNotePath(note, tenantFolder) {
  const { year, month, day } = storageDateParts(note.created_at);
  const osToken = normalizeOsToken(note.os, note.id_notas_servico.slice(0, 8));
  return `${tenantFolder}/${year}/${month}/${day}/OS-${osToken}.pdf`;
}

function desiredPayablePath(attachment, tenantFolder) {
  const { year, month, day } = storageDateParts(attachment.created_at);
  const safeName = sanitizeFilename(attachment.nome_arquivo || path.basename(cleanText(attachment.url)), 'anexo');
  return `${tenantFolder}/${year}/${month}/${day}/${attachment.fk_contas_pagar}/${attachment.id_anexo.slice(0, 8)}-${safeName}`;
}

async function loadNoteOperations(owner, tenantFolder) {
  const rows = await fetchAll(() => supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select('id_notas_servico, os, created_at, pdf_url, pdf_formato')
    .eq('criado_por_usuario', owner.id_usuarios)
    .not('pdf_url', 'is', null)
    .order('created_at', { ascending: true }));

  return rows
    .filter((note) => isStoragePath(note.pdf_url))
    .map((note) => ({
      kind: 'note',
      bucket: 'notas',
      id: note.id_notas_servico,
      oldPath: cleanText(note.pdf_url),
      newPath: desiredNotePath(note, tenantFolder),
      note,
    }))
    .filter((op) => op.oldPath !== op.newPath);
}

async function loadPayableOperations(owner, tenantFolder) {
  const payables = await fetchAll(() => supabase
    .schema('RetificaPremium')
    .from('Contas_Pagar')
    .select('id_contas_pagar')
    .eq('fk_criado_por', owner.id_usuarios));
  const payableIds = payables.map((row) => row.id_contas_pagar);
  const attachments = [];

  for (let i = 0; i < payableIds.length; i += 100) {
    const ids = payableIds.slice(i, i + 100);
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .schema('RetificaPremium')
      .from('Contas_Pagar_Anexos')
      .select('id_anexo, fk_contas_pagar, tipo, nome_arquivo, url, fk_criado_por, created_at')
      .in('fk_contas_pagar', ids);
    if (error) throw error;
    attachments.push(...(data ?? []));
  }

  const { data: direct, error: directError } = await supabase
    .schema('RetificaPremium')
    .from('Contas_Pagar_Anexos')
    .select('id_anexo, fk_contas_pagar, tipo, nome_arquivo, url, fk_criado_por, created_at')
    .eq('fk_criado_por', owner.id_usuarios);
  if (directError) throw directError;
  attachments.push(...(direct ?? []));

  const uniqueAttachments = [...new Map(attachments.map((row) => [row.id_anexo, row])).values()];
  return uniqueAttachments
    .filter((attachment) => isStoragePath(attachment.url))
    .map((attachment) => ({
      kind: 'payable',
      bucket: 'contas-pagar',
      id: attachment.id_anexo,
      oldPath: cleanText(attachment.url),
      newPath: desiredPayablePath(attachment, tenantFolder),
      attachment,
    }))
    .filter((op) => op.oldPath !== op.newPath);
}

function withCollisionSuffix(ops) {
  const groups = new Map();
  for (const op of ops) {
    const key = `${op.bucket}:${op.newPath}`;
    groups.set(key, [...(groups.get(key) ?? []), op]);
  }

  return ops.map((op) => {
    const key = `${op.bucket}:${op.newPath}`;
    const group = groups.get(key) ?? [];
    if (group.length <= 1) return op;

    const extension = op.newPath.includes('.') ? `.${op.newPath.split('.').pop()}` : '';
    const base = extension ? op.newPath.slice(0, -extension.length) : op.newPath;
    return {
      ...op,
      newPath: `${base}-${op.id.slice(0, 8)}${extension}`,
      collisionResolved: true,
    };
  });
}

async function pathExists(bucket, storagePath) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
  return Boolean(data?.signedUrl) && !error;
}

async function existingPathSet(bucket, paths) {
  const uniquePaths = [...new Set(paths)];
  const existing = new Set();

  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chunk, 60);
    if (error) {
      for (const storagePath of chunk) {
        if (await pathExists(bucket, storagePath)) existing.add(storagePath);
      }
      continue;
    }

    for (let j = 0; j < chunk.length; j += 1) {
      if (data?.[j]?.signedUrl) existing.add(chunk[j]);
    }
  }

  return existing;
}

async function validateOperations(ops) {
  const missingSources = [];
  const existingTargets = [];
  const byBucket = new Map();

  for (const op of ops) {
    const group = byBucket.get(op.bucket) ?? { sources: [], targets: [], ops: [] };
    group.sources.push(op.oldPath);
    group.targets.push(op.newPath);
    group.ops.push(op);
    byBucket.set(op.bucket, group);
  }

  for (const [bucket, group] of byBucket.entries()) {
    const existingSources = await existingPathSet(bucket, group.sources);
    const existingTargetSet = await existingPathSet(bucket, group.targets);

    for (const op of group.ops) {
      if (!existingSources.has(op.oldPath)) missingSources.push(op);
      if (existingTargetSet.has(op.newPath)) existingTargets.push(op);
    }
  }

  return { missingSources, existingTargets };
}

async function updateReference(op) {
  if (op.kind === 'note') {
    const { error } = await supabase
      .schema('RetificaPremium')
      .from('Notas_de_Servico')
      .update({
        pdf_url: op.newPath,
        pdf_formato: 'supabase_storage',
        updated_at: new Date().toISOString(),
      })
      .eq('id_notas_servico', op.id);
    if (error) throw new Error(`Falha ao atualizar nota ${op.id}: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .schema('RetificaPremium')
    .from('Contas_Pagar_Anexos')
    .update({
      url: op.newPath,
    })
    .eq('id_anexo', op.id);
  if (error) throw new Error(`Falha ao atualizar anexo ${op.id}: ${error.message}`);
}

async function moveOperation(op) {
  const { error: moveError } = await supabase.storage.from(op.bucket).move(op.oldPath, op.newPath);
  if (moveError) throw new Error(`Falha ao mover ${op.bucket}:${op.oldPath}: ${moveError.message}`);

  try {
    await updateReference(op);
  } catch (error) {
    await supabase.storage.from(op.bucket).move(op.newPath, op.oldPath);
    throw error;
  }

  if (!await pathExists(op.bucket, op.newPath)) {
    throw new Error(`Destino nao validado apos move: ${op.bucket}:${op.newPath}`);
  }

  return {
    kind: op.kind,
    id: op.id,
    oldPath: op.oldPath,
    newPath: op.newPath,
  };
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
        results[currentIndex] = { status: 'moved', ...(await worker(item)) };
      } catch (error) {
        results[currentIndex] = {
          status: 'failed',
          kind: item.kind,
          id: item.id,
          oldPath: item.oldPath,
          newPath: item.newPath,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      const done = results.filter(Boolean).length;
      if (done % 50 === 0 || done === items.length) {
        console.log(`[storage-normalization] ${done}/${items.length} processados`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!['all', 'notes', 'payables'].includes(ONLY)) {
    throw new Error('--only deve ser all, notes ou payables.');
  }

  const owner = await getTargetOwner();
  const tenantFolder = slugifyStorageSegment(owner.nome || owner.email || owner.id_usuarios);
  const operations = withCollisionSuffix([
    ...(ONLY === 'all' || ONLY === 'notes' ? await loadNoteOperations(owner, tenantFolder) : []),
    ...(ONLY === 'all' || ONLY === 'payables' ? await loadPayableOperations(owner, tenantFolder) : []),
  ]);
  const validation = await validateOperations(operations);

  let results = [];
  if (APPLY && validation.missingSources.length === 0 && validation.existingTargets.length === 0) {
    results = await runPool(operations, moveOperation);
  }

  const failures = results.filter((result) => result.status === 'failed');
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    only: ONLY,
    tenant_folder: tenantFolder,
    target_owner: {
      id_usuarios: owner.id_usuarios,
      auth_id_prefix: String(owner.auth_id ?? '').slice(0, 8),
      nome: owner.nome,
      email: owner.email,
    },
    planned: {
      total: operations.length,
      notes: operations.filter((op) => op.kind === 'note').length,
      payables: operations.filter((op) => op.kind === 'payable').length,
      collision_resolved: operations.filter((op) => op.collisionResolved).length,
      sample: operations.slice(0, 12).map((op) => ({
        kind: op.kind,
        id: op.id,
        oldPath: op.oldPath,
        newPath: op.newPath,
      })),
    },
    validation: {
      missing_sources: validation.missingSources.length,
      existing_targets: validation.existingTargets.length,
      sample_missing_sources: validation.missingSources.slice(0, 12).map((op) => ({ kind: op.kind, id: op.id, oldPath: op.oldPath })),
      sample_existing_targets: validation.existingTargets.slice(0, 12).map((op) => ({ kind: op.kind, id: op.id, newPath: op.newPath })),
    },
    applied: {
      moved: results.filter((result) => result.status === 'moved').length,
      failed: failures.length,
      sample_moved: results.filter((result) => result.status === 'moved').slice(0, 12),
      failures: failures.slice(0, 12),
    },
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (validation.missingSources.length > 0 || validation.existingTargets.length > 0 || failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[storage-normalization] Falha:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
