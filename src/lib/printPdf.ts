const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function openPdfPrintDialog(url: string, title = 'Imprimir documento') {
  const popup = window.open('', '_blank');

  if (!popup) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const safeTitle = escapeHtmlAttribute(title);
  const safeUrl = escapeHtmlAttribute(url);

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          html, body, iframe {
            width: 100%;
            height: 100%;
            margin: 0;
            border: 0;
            overflow: hidden;
            background: #f3f4f6;
          }
        </style>
      </head>
      <body>
        <iframe id="pdf-frame" src="${safeUrl}" title="${safeTitle}"></iframe>
        <script>
          window.opener = null;
          const frame = document.getElementById('pdf-frame');
          const printPdf = () => {
            try {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            } catch (error) {
              window.print();
            }
          };
          frame.addEventListener('load', () => setTimeout(printPdf, 350), { once: true });
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}

export function createPdfPreviewWindow(title = 'Abrindo PDF') {
  // Sem 'noopener' na feature string: com ela o Chrome abre a guia mas retorna
  // null, o que órfã a guia em branco e força o caller a abrir outra. O opener
  // é anulado manualmente logo abaixo, já que o documento é nosso (about:blank).
  const popup = window.open('', '_blank');
  if (!popup) return null;

  const safeTitle = escapeHtmlAttribute(title);
  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #334155;
            background: #f8fafc;
          }
        </style>
      </head>
      <body>Preparando PDF...</body>
    </html>
  `);
  popup.document.close();
  try {
    popup.opener = null;
  } catch {
    // Alguns navegadores bloqueiam a escrita; a guia continua utilizável.
  }
  return popup;
}

export function openPdfInBrowser(
  url: string,
  options: {
    title?: string;
    previewWindow?: Window | null;
    revokeObjectUrlAfterMs?: number;
  } = {},
) {
  const popup = options.previewWindow ?? window.open('', '_blank');

  if (!popup) {
    const fallback = window.open(url, '_blank');
    if (!fallback) return false;
    try {
      fallback.opener = null;
    } catch {
      // Navegação cruzada pode bloquear a escrita; seguimos mesmo assim.
    }
  } else {
    try {
      if (options.title) popup.document.title = options.title;
    } catch {
      // Navegadores podem bloquear acesso ao documento depois da navegação.
    }
    popup.location.href = url;
  }

  if (url.startsWith('blob:') && options.revokeObjectUrlAfterMs) {
    window.setTimeout(() => URL.revokeObjectURL(url), options.revokeObjectUrlAfterMs);
  }

  return true;
}

const sanitizePdfFilename = (value: string) => {
  const clean = value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const base = clean || 'documento.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
};

/** Baixa um blob de PDF diretamente (sem abrir guia), com nome de arquivo amigável. */
export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizePdfFilename(filename);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Baixa o PDF de uma URL (assinada) diretamente para o disco, sem abrir guia.
 * Lança erro se a resposta não for OK — o caller decide o fallback.
 */
export async function downloadPdfFromUrl(url: string, filename: string) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Falha ao baixar o PDF (HTTP ${response.status}).`);
  }
  downloadPdfBlob(await response.blob(), filename);
}
