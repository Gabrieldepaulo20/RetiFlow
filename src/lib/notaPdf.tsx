import type { NotaServicoDetalhes } from '@/api/supabase/notas';
import type { OsTemplateMode } from '@/api/supabase/modelos';
import type { ResolvedDocumentCustomization } from '@/services/domain/documentCustomization';

export async function generateNotaPdfBlob(
  dados: NotaServicoDetalhes,
  options?: {
    accentColor?: string;
    templateMode?: OsTemplateMode;
    documentSettings?: ResolvedDocumentCustomization | null;
  },
): Promise<Blob> {
  const [{ pdf }, { NotaPDFTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/notes/NotaPDFTemplate'),
  ]);

  return pdf(
    <NotaPDFTemplate
      dados={dados}
      accentColor={options?.accentColor}
      templateMode={options?.templateMode}
      documentSettings={options?.documentSettings}
    />,
  ).toBlob();
}
