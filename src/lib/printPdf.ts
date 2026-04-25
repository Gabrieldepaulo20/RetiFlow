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
