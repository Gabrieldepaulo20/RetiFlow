import { lazy, Suspense } from 'react';
import type { CSSProperties } from 'react';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

interface NotaPDFViewerProps {
  dados: NotaServicoDetalhes;
  style?: CSSProperties;
}

const NotaPDFViewerInner = lazy(async () => {
  const [{ PDFViewer }, { NotaPDFTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/notes/NotaPDFTemplate'),
  ]);

  return {
    default: function NotaPDFViewer({ dados, style }: NotaPDFViewerProps) {
      return (
        <PDFViewer width="100%" height="100%" style={style ?? { border: 'none', flex: 1 }}>
          <NotaPDFTemplate dados={dados} />
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
