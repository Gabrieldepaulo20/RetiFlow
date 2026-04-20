import { z } from 'zod';

export const brasilApiCnpjResponseSchema = z.object({
  razao_social: z.string().optional(),
  nome_fantasia: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
  email: z.string().optional(),
  ddd_telefone_1: z.string().optional(),
  ddd_telefone_2: z.string().optional(),
});

export type BrasilApiCnpjResponse = z.infer<typeof brasilApiCnpjResponseSchema>;
