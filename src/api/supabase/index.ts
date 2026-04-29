/**
 * Camada de acesso ao Supabase — ponto único de importação.
 *
 * Uso nos componentes/contextos:
 *   import { getClientes, novoCliente } from '@/api/supabase'
 *
 * Nunca importar `supabase` (o client) diretamente nos componentes.
 * Toda chamada passa por aqui para garantir tipagem, tratamento de erro e log.
 */

export * from './auth';
export * from './clientes';
export * from './notas';
export * from './contas-pagar';
export * from './faturas';
export * from './usuarios';
export * from './fechamentos';
export * from './fornecedores';
export * from './categorias';
export * from './sugestoes-email';
export * from './catalogo';
export * from './logs';
export * from './modelos';
