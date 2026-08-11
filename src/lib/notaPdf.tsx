import type { NotaServicoDetalhes } from '@/api/supabase/notas';
import type { OsTemplateMode } from '@/api/supabase/modelos';
import {
  assertDocumentCustomizationForUser,
  type ResolvedDocumentCustomization,
} from '@/services/domain/documentCustomization';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export async function generateNotaPdfBlob(
  dados: NotaServicoDetalhes,
  options: {
    accentColor?: string;
    templateMode?: OsTemplateMode;
    documentSettings: ResolvedDocumentCustomization;
    expectedUserId: string;
  },
): Promise<Blob> {
  if (IS_REAL_AUTH) {
    assertDocumentCustomizationForUser(options.documentSettings, options.expectedUserId, 'entry_note');
    if (
      dados.cabecalho.criado_por_usuario !== options.expectedUserId
    ) {
      throw new Error('A O.S. não pertence à empresa ativa. A geração do PDF foi interrompida.');
    }
  }

  const [{ pdf }, { NotaPDFTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/notes/NotaPDFTemplate'),
  ]);

  return pdf(
    <NotaPDFTemplate
      dados={dados}
      accentColor={options.accentColor}
      templateMode={options.templateMode}
      documentSettings={options.documentSettings}
      expectedUserId={options.expectedUserId}
    />,
  ).toBlob();
}
