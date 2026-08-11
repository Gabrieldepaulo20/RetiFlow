import { lazy, Suspense } from 'react';
import type { Style } from '@react-pdf/types';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import { Button } from '@/components/ui/button';

interface NotaPDFViewerProps {
  dados: NotaServicoDetalhes;
  style?: Style;
}

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

const NotaPDFViewerInner = lazy(async () => {
  const [{ PDFViewer }, { NotaPDFTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/notes/NotaPDFTemplate'),
  ]);

  return {
    default: function NotaPDFViewer({ dados, style }: NotaPDFViewerProps) {
      const templateSettingsQuery = useDocumentTemplateSettings();
      const documentSettingsQuery = useDocumentCustomization('entry_note');
      const expectedUserId = documentSettingsQuery.data.fkUsuarios;
      const ownerMatches = !IS_REAL_AUTH || dados.cabecalho.criado_por_usuario === expectedUserId;
      const ready = templateSettingsQuery.isReady && documentSettingsQuery.isReady && ownerMatches;

      if (!ready) {
        const failed = templateSettingsQuery.isError
          || templateSettingsQuery.isScopeMismatch
          || documentSettingsQuery.isError
          || documentSettingsQuery.isScopeMismatch
          || !ownerMatches;
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {!ownerMatches
                ? 'A empresa responsável por esta O.S. não pôde ser validada.'
                : failed
                  ? 'Não foi possível validar a identidade da empresa.'
                  : 'Validando a identidade da empresa...'}
            </p>
            {failed && ownerMatches ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void templateSettingsQuery.refetch();
                  void documentSettingsQuery.refetch();
                }}
              >
                Tentar novamente
              </Button>
            ) : null}
          </div>
        );
      }

      return (
        <PDFViewer width="100%" height="100%" style={style ?? { border: 'none', flex: 1 }}>
          <NotaPDFTemplate
            dados={dados}
            accentColor={templateSettingsQuery.data.corDocumento}
            templateMode={templateSettingsQuery.data.osModelo}
            documentSettings={documentSettingsQuery.data}
            expectedUserId={expectedUserId}
          />
        </PDFViewer>
      );
    },
  };
});

export function LazyNotaPDFViewer({ dados, style }: NotaPDFViewerProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando visualização do PDF...
        </div>
      }
    >
      <NotaPDFViewerInner dados={dados} style={style} />
    </Suspense>
  );
}
