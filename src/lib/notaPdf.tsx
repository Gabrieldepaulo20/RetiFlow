import type { NotaServicoDetalhes } from '@/api/supabase/notas';

export async function generateNotaPdfBlob(dados: NotaServicoDetalhes): Promise<Blob> {
  const [{ pdf }, { NotaPDFTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/notes/NotaPDFTemplate'),
  ]);

  return pdf(<NotaPDFTemplate dados={dados} />).toBlob();
}
