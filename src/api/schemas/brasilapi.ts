import { z } from 'zod';

const brasilApiStringField = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => (value == null ? '' : String(value)));

export const brasilApiCnpjResponseSchema = z.object({
  razao_social: brasilApiStringField,
  nome_fantasia: brasilApiStringField,
  cep: brasilApiStringField,
  logradouro: brasilApiStringField,
  numero: brasilApiStringField,
  bairro: brasilApiStringField,
  municipio: brasilApiStringField,
  uf: brasilApiStringField,
  email: brasilApiStringField,
  ddd_telefone_1: brasilApiStringField,
  ddd_telefone_2: brasilApiStringField,
});

export type BrasilApiCnpjResponse = z.infer<typeof brasilApiCnpjResponseSchema>;
