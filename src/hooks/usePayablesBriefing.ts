import { useMutation } from '@tanstack/react-query';
import { gerarBriefingContasPagar, type BriefingIaResult, type GerarBriefingPayload } from '@/api/supabase/contas-pagar';
import { useToast } from '@/hooks/use-toast';

/**
 * Gera o resumo da semana com IA sob demanda (o usuário clica em atualizar).
 * Mantemos como mutation — não dispara sozinho — para não gastar tokens da
 * OpenAI a cada carregamento da página.
 */
export function usePayablesBriefing() {
  const { toast } = useToast();

  const mutation = useMutation<BriefingIaResult, Error, GerarBriefingPayload>({
    mutationFn: gerarBriefingContasPagar,
    onError: (error) => {
      toast({
        title: 'Não foi possível gerar o resumo com IA',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    iaBriefing: mutation.data ?? null,
    isGenerating: mutation.isPending,
    generate: mutation.mutate,
  };
}
