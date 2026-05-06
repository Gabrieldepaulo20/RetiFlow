import { AppModuleKey, Permission, SystemUser, UserRole } from '@/types';

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ['admin.access'],
  FINANCEIRO: ['dashboard.view', 'clients.view', 'notes.view', 'kanban.view', 'closing.view', 'payables.view', 'payables.manage', 'invoices.view'],
  PRODUCAO: ['dashboard.view', 'notes.view', 'notes.status.manage', 'notes.attachments.view', 'kanban.view', 'kanban.manage', 'invoices.view'],
  RECEPCAO: ['dashboard.view', 'clients.view', 'clients.manage', 'notes.view', 'notes.manage', 'kanban.view', 'invoices.view'],
};

const IMPLIED_PERMISSIONS: Record<Permission, Permission[]> = {
  'dashboard.view': [],
  'clients.view': [],
  'clients.manage': ['clients.view'],
  'notes.view': [],
  'notes.manage': ['notes.view'],
  'notes.status.manage': ['notes.view'],
  'notes.attachments.view': ['notes.view'],
  'kanban.view': [],
  'kanban.manage': ['kanban.view', 'notes.view'],
  'closing.view': [],
  'invoices.view': [],
  'payables.view': [],
  'payables.manage': ['payables.view'],
  'settings.view': [],
  'admin.access': [
    'dashboard.view',
    'clients.view',
    'clients.manage',
    'notes.view',
    'notes.manage',
    'notes.status.manage',
    'notes.attachments.view',
    'kanban.view',
    'kanban.manage',
    'closing.view',
    'invoices.view',
    'payables.view',
    'payables.manage',
    'settings.view',
  ],
};

export const MODULE_PERMISSIONS: Record<AppModuleKey, Permission> = {
  admin: 'admin.access',
  dashboard: 'dashboard.view',
  clients: 'clients.view',
  notes: 'notes.view',
  kanban: 'kanban.view',
  closing: 'closing.view',
  invoices: 'invoices.view',
  payables: 'payables.view',
  settings: 'settings.view',
};

export function getUserBasePermissions(user: Pick<SystemUser, 'role'>): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[user.role];
}

export function expandPermissions(permissions: Permission[]): Permission[] {
  const resolved = new Set<Permission>();
  const queue = [...permissions];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || resolved.has(current)) {
      continue;
    }

    resolved.add(current);
    for (const implied of IMPLIED_PERMISSIONS[current]) {
      if (!resolved.has(implied)) {
        queue.push(implied);
      }
    }
  }

  return Array.from(resolved);
}

export function hasPermission(user: Pick<SystemUser, 'role'> | null, permission: Permission): boolean {
  if (!user) {
    return false;
  }

  const permissions = expandPermissions(getUserBasePermissions(user));
  return permissions.includes(permission);
}

export function getModulePermission(moduleKey: AppModuleKey): Permission {
  return MODULE_PERMISSIONS[moduleKey];
}
