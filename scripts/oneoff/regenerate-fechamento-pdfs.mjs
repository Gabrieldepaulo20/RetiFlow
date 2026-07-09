/**
 * Regenera os PDFs de fechamento salvos no Storage a partir do snapshot imutável
 * (`dados_json`), aplicando o template atual (ex.: rodapé "Total:" em vez de
 * "Total OS-xxxx:"). O download da interface já re-renderiza do dados_json, mas
 * os arquivos físicos antigos no bucket privado `fechamentos` continuam com o
 * layout velho — este script padroniza esses arquivos.
 *
 * Uso:
 *   node scripts/oneoff/regenerate-fechamento-pdfs.mjs            # dry-run (não escreve)
 *   node scripts/oneoff/regenerate-fechamento-pdfs.mjs --apply    # regrava no Storage
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env.local/.env.integration.
 * Segue a convenção do projeto: dry-run por padrão, --apply para escrever.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const APPLY = process.argv.includes('--apply');
const FECHAMENTOS_BUCKET = 'fechamentos';
const REPORT_PATH = process.env.REPORT_PATH
  ?? path.join(process.cwd(), 'tmp', 'fechamento-pdfs-regeneration.json');

// Silencia o warning conhecido do react-pdf de string vazia fora de <Text>.
const emptyTextWarning = "Invalid '' string child outside <Text> component";
const origErr = console.error.bind(console);
console.error = (...args) => { if (args.some((a) => String(a).includes(emptyTextWarning))) return; origErr(...args); };

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

const env = {
  ...readEnvFile(path.join(process.cwd(), '.env.local')),
  ...readEnvFile(path.join(process.cwd(), '.env.integration')),
  ...process.env,
};
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service env ausente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

function extractStoragePath(pathOrUrl) {
  const value = String(pathOrUrl ?? '').trim();
  if (!value || value.startsWith('blob:')) return null;
  const norm = (p) => decodeURIComponent(p).replace(/^\/+/, '').replace(/^object\/(?:public|sign)\/fechamentos\//, '') || null;
  if (!/^https?:\/\//i.test(value)) return norm(value);
  try {
    const url = new URL(value);
    const pub = `/storage/v1/object/public/${FECHAMENTOS_BUCKET}/`;
    const sign = `/storage/v1/object/sign/${FECHAMENTOS_BUCKET}/`;
    const marker = url.pathname.includes(pub) ? pub : url.pathname.includes(sign) ? sign : null;
    return marker ? norm(url.pathname.split(marker)[1] ?? '') : null;
  } catch { return null; }
}

function accentFrom(snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const candidates = [s.corFechamento, s.primaryColor, s?.theme?.primaryColor, s?.config?.primaryColor];
  const hit = candidates.find((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c));
  return hit ?? '#0f7f95';
}

async function pdfToBuffer(instance) {
  const blob = await instance.toBlob();
  return Buffer.from(await blob.arrayBuffer());
}

async function loadFechamentos() {
  const { data, error } = await supabase.schema('RetificaPremium').from('Fechamentos')
    .select('id_fechamentos, periodo, pdf_url, dados_json, documento_config_snapshot, documento_tema_snapshot')
    .not('dados_json', 'is', null);
  if (error) throw new Error(`fechamentos_query_failed:${error.message}`);
  return data ?? [];
}

async function main() {
  const vite = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
  const results = [];
  try {
    const { ClosingPDFTemplate } = await vite.ssrLoadModule('/src/components/closing/ClosingPDFTemplate.tsx');
    const fechamentos = await loadFechamentos();

    for (const f of fechamentos) {
      const targetPath = extractStoragePath(f.pdf_url);
      if (!targetPath) { results.push({ status: 'skipped_no_path', id: f.id_fechamentos, periodo: f.periodo }); continue; }
      try {
        const geradoEm = f.dados_json?.gerado_em ?? new Date(0).toISOString();
        const accent = accentFrom(f.documento_tema_snapshot ?? f.documento_config_snapshot);
        const buffer = await pdfToBuffer(pdf(React.createElement(ClosingPDFTemplate, {
          dados: f.dados_json, geradoEm, accentColor: accent,
        })));
        if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') throw new Error('generated_not_pdf');

        if (!APPLY) {
          results.push({ status: 'dry_run_generated', id: f.id_fechamentos, periodo: f.periodo, path: targetPath, bytes: buffer.length });
          continue;
        }
        const { error: upErr } = await supabase.storage.from(FECHAMENTOS_BUCKET)
          .upload(targetPath, buffer, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
        if (upErr) throw new Error(`upload_failed:${upErr.message}`);
        // Valida leitura via signed URL.
        const { data: signed } = await supabase.storage.from(FECHAMENTOS_BUCKET).createSignedUrl(targetPath, 60);
        results.push({ status: 'regenerated', id: f.id_fechamentos, periodo: f.periodo, path: targetPath, bytes: buffer.length, signed: Boolean(signed?.signedUrl) });
      } catch (err) {
        results.push({ status: 'failed', id: f.id_fechamentos, periodo: f.periodo, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await vite.close();
  }

  const counters = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', total: results.length, counters, results }, null, 2)}\n`);
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', total: results.length, counters, report: REPORT_PATH }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
