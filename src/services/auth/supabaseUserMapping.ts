import type { AppModuleKey, SystemUser, UserRole } from '@/types';

type DbModules = Partial<Record<
  'dashboard' | 'clientes' | 'notas_de_entrada' | 'kanban' | 'fechamento' | 'nota_fiscal' | 'configuracoes' | 'contas_a_pagar' | 'admin',
  boolean | null
>>;

type DbUser = {
  id_usuarios: string;
  nome: string;
  email: string;
  telefone?: string | null;
  acesso: string;
  status: boolean;
  created_at?: string;
  ultimo_login?: string | null;
  modulos?: DbModules | null;
};

export const ACESSO_PARA_ROLE: Record<string, UserRole> = {
  administrador: 'ADMIN',
  financeiro: 'FINANCEIRO',
  produção: 'PRODUCAO',
  recepção: 'RECEPCAO',
};

export const ROLE_PARA_ACESSO: Record<UserRole, string> = {
  ADMIN: 'administrador',
  FINANCEIRO: 'financeiro',
  PRODUCAO: 'produção',
  RECEPCAO: 'recepção',
};

const DB_TO_APP_MODULE: Record<keyof DbModules, AppModuleKey> = {
  dashboard: 'dashboard',
  clientes: 'clients',
  notas_de_entrada: 'notes',
  kanban: 'kanban',
  fechamento: 'closing',
  nota_fiscal: 'invoices',
  configuracoes: 'settings',
  contas_a_pagar: 'payables',
  admin: 'admin',
};

const APP_TO_RPC_MODULE: Partial<Record<AppModuleKey, string>> = {
  dashboard: 'p_dashboard',
  clients: 'p_clientes',
  notes: 'p_notas_de_entrada',
  kanban: 'p_kanban',
  closing: 'p_fechamento',
  invoices: 'p_nota_fiscal',
  settings: 'p_configuracoes',
  payables: 'p_contas_a_pagar',
  admin: 'p_admin',
};

export function dbModulesToAppModules(modulos?: DbModules | null): Partial<Record<AppModuleKey, boolean>> | undefined {
  if (!modulos) return undefined;

  const mapped = Object.entries(modulos).reduce<Partial<Record<AppModuleKey, boolean>>>((accumulator, [dbKey, value]) => {
    const appKey = DB_TO_APP_MODULE[dbKey as keyof DbModules];
    if (appKey && typeof value === 'boolean') {
      accumulator[appKey] = value;
    }
    return accumulator;
  }, {});

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

export function appModulesToRpcPayload(moduleAccess: Partial<Record<AppModuleKey, boolean>>) {
  return Object.entries(moduleAccess).reduce<Record<string, boolean>>((accumulator, [appKey, value]) => {
    const rpcKey = APP_TO_RPC_MODULE[appKey as AppModuleKey];
    if (rpcKey && typeof value === 'boolean') {
      accumulator[rpcKey] = value;
    }
    return accumulator;
  }, {});
}

export function dbUserToSystemUser(user: DbUser): SystemUser {
  return {
    id: user.id_usuarios,
    name: user.nome,
    email: user.email,
    role: ACESSO_PARA_ROLE[user.acesso] ?? 'RECEPCAO',
    isActive: user.status,
    createdAt: user.created_at ?? new Date().toISOString(),
    lastLogin: user.ultimo_login ?? undefined,
    phone: user.telefone || undefined,
    moduleAccess: dbModulesToAppModules(user.modulos),
  };
}
