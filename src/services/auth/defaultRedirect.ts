import type { AppModuleKey, SystemUser } from '@/types';
import { getModulePermission, hasPermission } from '@/services/auth/permissions';
import { isRoleModuleEnabled, isUserModuleEnabled } from '@/services/auth/moduleAccess';

const MODULE_PATHS: Record<AppModuleKey, string> = {
  admin: '/admin',
  dashboard: '/dashboard',
  clients: '/clientes',
  notes: '/notas-entrada',
  kanban: '/kanban',
  closing: '/fechamento',
  invoices: '/nota-fiscal',
  payables: '/contas-a-pagar',
  settings: '/configuracoes',
};

const DEFAULT_MODULE_ORDER: Record<SystemUser['role'], AppModuleKey[]> = {
  ADMIN: ['admin', 'dashboard', 'clients', 'notes', 'kanban', 'closing', 'payables', 'settings'],
  FINANCEIRO: ['dashboard', 'payables', 'closing', 'clients', 'notes', 'kanban'],
  PRODUCAO: ['dashboard', 'kanban', 'notes'],
  RECEPCAO: ['dashboard', 'clients', 'notes', 'kanban'],
};

function shouldUseRealModuleAccess(user: SystemUser) {
  if (!user.moduleAccess) return false;
  return DEFAULT_MODULE_ORDER[user.role].some((moduleKey) => {
    if (user.role === 'ADMIN' && moduleKey === 'admin') return true;
    return user.moduleAccess?.[moduleKey] === true && hasPermission(user, getModulePermission(moduleKey));
  });
}

export function canUserAccessModule(user: SystemUser | null, moduleKey: AppModuleKey) {
  if (!user) return false;
  if (user.role === 'ADMIN' && moduleKey === 'admin') return true;

  const permission = getModulePermission(moduleKey);
  if (!hasPermission(user, permission)) return false;
  const useRealModuleAccess = shouldUseRealModuleAccess(user);
  if (useRealModuleAccess && user.moduleAccess?.[moduleKey] === false) return false;
  if (useRealModuleAccess) return true;
  if (!isRoleModuleEnabled(user.role, moduleKey)) return false;
  if (!isUserModuleEnabled(user.id, moduleKey)) return false;
  return true;
}

export function getDefaultRedirect(user: SystemUser) {
  const moduleKey = DEFAULT_MODULE_ORDER[user.role].find((candidate) => canUserAccessModule(user, candidate));
  return moduleKey ? MODULE_PATHS[moduleKey] : '/acesso-negado';
}
