import type { AppModuleKey, SystemUser } from '@/types';
import { getModulePermission, hasPermission } from '@/services/auth/permissions';
import { DEFAULT_ROLE_MODULE_CONFIG, isRoleModuleEnabled, isUserModuleEnabled } from '@/services/auth/moduleAccess';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

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

const ALL_MODULES: AppModuleKey[] = ['dashboard', 'clients', 'notes', 'kanban', 'closing', 'payables', 'invoices', 'settings', 'admin'];

export function canUserAccessModule(user: SystemUser | null, moduleKey: AppModuleKey) {
  if (!user) return false;
  if (user.role === 'ADMIN' && moduleKey === 'admin') {
    return user.moduleAccess ? user.moduleAccess.admin !== false : true;
  }

  if (user.moduleAccess) {
    if (moduleKey === 'admin') return false;
    return user.moduleAccess[moduleKey] === true;
  }

  // No explicit DB module access — fall back to role-based defaults.
  // In real auth mode, use the static role config to prevent localStorage manipulation
  // from affecting permissions in production.
  if (IS_REAL_AUTH) {
    return DEFAULT_ROLE_MODULE_CONFIG[user.role]?.[moduleKey] !== false;
  }

  const permission = getModulePermission(moduleKey);
  if (!hasPermission(user, permission)) return false;

  // In mock/dev mode, respect localStorage-based config with per-user overrides.
  if (!isRoleModuleEnabled(user.role, moduleKey)) return false;
  if (!isUserModuleEnabled(user.id, moduleKey)) return false;
  return true;
}

export function getDefaultRedirect(user: SystemUser) {
  const orderedModules = user.moduleAccess
    ? Array.from(new Set([...DEFAULT_MODULE_ORDER[user.role], ...ALL_MODULES]))
    : DEFAULT_MODULE_ORDER[user.role];
  const moduleKey = orderedModules.find((candidate) => canUserAccessModule(user, candidate));
  return moduleKey ? MODULE_PATHS[moduleKey] : '/acesso-negado';
}
