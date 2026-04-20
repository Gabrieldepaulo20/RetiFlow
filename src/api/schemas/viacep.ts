import { z } from 'zod';

export const viaCepResponseSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

export type ViaCepResponse = z.infer<typeof viaCepResponseSchema>;
