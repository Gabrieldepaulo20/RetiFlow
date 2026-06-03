import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const VERIFY_EXISTING = process.argv.includes('--verify-existing');
const LEGACY_COMPANY_ID = Number(process.env.LEGACY_COMPANY_ID ?? 5);
const TARGET_OWNER_NAME = process.env.RETIFLOW_TARGET_OWNER_NAME ?? 'Retífica Premium';
const TARGET_OWNER_ID = process.env.RETIFLOW_TARGET_OWNER_ID ?? null;
const BUCKET = 'notas';
const CONCURRENCY = Math.max(1, Number(process.env.PDF_MIGRATION_CONCURRENCY ?? 6));
const LIMIT = Number(process.env.PDF_MIGRATION_LIMIT ?? 0);
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'legacy-note-pdfs-storage-migration.json');
const DOWNLOAD_TIMEOUT_MS = Number(process.env.PDF_DOWNLOAD_TIMEOUT_MS ?? 20000);
const MAX_RETRIES = Number(process.env.PDF_DOWNLOAD_RETRIES ?? 2);
const MIGRATED_FORMAT = 'supabase_storage_legacy_s3';

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

function normalizeStorageToken(value, fallback) {
  const token = cleanText(value)
    .replace(/^OS-/i, '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 80);
  return token || fallback;
}

function monthParts(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    year: String(safeDate.getFullYear()),
    month: String(safeDate.getMonth() + 1).padStart(2, '0'),
  };
}

function storagePathForNote(note, authId) {
  const { year, month } = monthParts(note.created_at);
  const osToken = normalizeStorageToken(note.os, note.id_notas_servico.slice(0, 8));
  return `${authId}/legacy/company-${LEGACY_COMPANY_ID}/${year}/${month}/OS-${osToken}-${note.id_notas_servico.slice(0, 8)}.pdf`;
}

async function getTargetOwner() {
  let query = supabase
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios, auth_id, nome, status');

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
  if (!active[0].auth_id) {
    throw new Error('Conta destino sem auth_id. Nao e seguro migrar para Storage owner-scoped.');
  }
  return active[0];
}

async function loadNotes(ownerId) {
  const formatFilter = VERIFY_EXISTING ? MIGRATED_FORMAT : 'legacy_s3';
  let query = supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .select('id_notas_servico, os, created_at, pdf_url, pdf_formato')
    .eq('criado_por_usuario', ownerId)
    .eq('pdf_formato', formatFilter)
    .order('created_at', { ascending: true });

  if (!VERIFY_EXISTING) query = query.like('pdf_url', 'http%');
  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchPdf(url, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`download_http_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 8) throw new Error('download_empty_or_too_small');
    const header = buffer.subarray(0, 5).toString('utf8');
    const contentType = response.headers.get('content-type') ?? '';
    if (header !== '%PDF-' && !contentType.toLowerCase().includes('pdf')) {
      throw new Error('download_not_pdf');
    }
    return { buffer, bytes: buffer.length, contentType: contentType || 'application/pdf' };
  } catch (error) {
    if (attempt < MAX_RETRIES) return fetchPdf(url, attempt + 1);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateStoragePath(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) throw new Error(`signed_url_failed:${error?.message ?? 'missing_url'}`);
  const response = await fetch(data.signedUrl, { method: 'GET' });
  if (!response.ok) throw new Error(`signed_download_http_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') throw new Error('signed_download_not_pdf');
  return buffer.length;
}

async function processNote(note, owner) {
  const targetPath = VERIFY_EXISTING ? note.pdf_url : storagePathForNote(note, owner.auth_id);

  if (VERIFY_EXISTING) {
    const bytes = await validateStoragePath(targetPath);
    return { status: 'verified_existing', note_id: note.id_notas_servico, path: targetPath, bytes };
  }

  const downloaded = await fetchPdf(note.pdf_url);

  if (!APPLY) {
    return {
      status: 'download_ok',
      note_id: note.id_notas_servico,
      path: targetPath,
      bytes: downloaded.bytes,
    };
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(targetPath, downloaded.buffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: true,
    });
  if (uploadError) throw new Error(`upload_failed:${uploadError.message}`);

  await validateStoragePath(targetPath);

  const { error: updateError } = await supabase
    .schema('RetificaPremium')
    .from('Notas_de_Servico')
    .update({
      pdf_url: targetPath,
      pdf_formato: MIGRATED_FORMAT,
      updated_at: new Date().toISOString(),
    })
    .eq('id_notas_servico', note.id_notas_servico);
  if (updateError) throw new Error(`note_update_failed:${updateError.message}`);

  return {
    status: 'migrated',
    note_id: note.id_notas_servico,
    path: targetPath,
    bytes: downloaded.bytes,
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
        const result = await worker(item);
        results[currentIndex] = result;
      } catch (error) {
        results[currentIndex] = {
          status: 'failed',
          note_id: item.id_notas_servico,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      const done = results.filter(Boolean).length;
      if (done % 25 === 0 || done === items.length) {
        console.log(`[pdf-migration] ${done}/${items.length} processados`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const owner = await getTargetOwner();
  const notes = await loadNotes(owner.id_usuarios);
  const results = await runPool(notes, (note) => processNote(note, owner));
  const counters = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
  const failures = results.filter((result) => result.status === 'failed');
  const totalBytes = results.reduce((sum, result) => sum + (result.bytes ?? 0), 0);

  const report = {
    generated_at: new Date().toISOString(),
    mode: VERIFY_EXISTING ? 'verify-existing' : APPLY ? 'apply' : 'dry-run',
    bucket: BUCKET,
    target_owner: {
      id_usuarios: owner.id_usuarios,
      auth_id_prefix: String(owner.auth_id).slice(0, 8),
      nome: owner.nome,
    },
    notes_found: notes.length,
    counters,
    failures,
    total_bytes: totalBytes,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[pdf-migration] Falha:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
