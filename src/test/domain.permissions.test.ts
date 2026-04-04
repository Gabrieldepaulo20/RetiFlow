import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  expandPermissions,
  getUserBasePermissions,
  hasPermission,
  MODULE_PERMISSIONS,
} from '@/services/auth/permissions';
import type { Permission, SystemUser } from '@/types';

function makeUser(role: SystemUser['role']): Pick<SystemUser, 'role'> {
  return { role };
}

// ─── expandPermissions ────────────────────────────────────────────────────────

describe('expandPermissions', () => {
  it('returns an empty array for no input permissions', () => {
    expect(expandPermissions([])).toHaveLength(0);
  });

  it('returns the permission itself when it has no implied permissions', () => {
    const result = expandPermissions(['dashboard.view']);
    expect(result).toContain('dashboard.view');
    expect(result).toHaveLength(1);
  });

  it('expands clients.manage to also include clients.view', () => {
    const result = expandPermissions(['clients.manage']);
    expect(result).toContain('clients.manage');
    expect(result).toContain('clients.view');
  });

  it('expands notes.manage to also include notes.view', () => {
    const result = expandPermissions(['notes.manage']);
    expect(result).toContain('notes.manage');
    expect(result).toContain('notes.view');
  });

  it('expands kanban.manage to kanban.view and notes.view', () => {
    const result = expandPermissions(['kanban.manage']);
    expect(result).toContain('kanban.manage');
    expect(result).toContain('kanban.view');
    expect(result).toContain('notes.view');
  });

  it('does not produce duplicates when multiple permissions share an implied one', () => {
    const result = expandPermissions(['notes.manage', 'notes.status.manage']);
    const noteViewCount = result.filter((p) => p === 'notes.view').length;
    expect(noteViewCount).toBe(1);
  });

  it('admin.access expands to include all non-admin permissions', () => {
    const result = expandPermissions(['admin.access']);
    const expected: Permission[] = [
      'admin.access',
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
      'settings.view',
    ];
    for (const perm of expected) {
      expect(result).toContain(perm);
    }
  });
});

// ─── getUserBasePermissions ───────────────────────────────────────────────────

describe('getUserBasePermissions', () => {
  it('returns base permissions for FINANCEIRO', () => {
    const perms = getUserBasePermissions(makeUser('FINANCEIRO'));
    expect(perms).toContain('closing.view');
    expect(perms).toContain('invoices.view');
    expect(perms).not.toContain('admin.access');
  });

  it('returns base permissions for PRODUCAO', () => {
    const perms = getUserBasePermissions(makeUser('PRODUCAO'));
    expect(perms).toContain('kanban.manage');
    expect(perms).toContain('notes.status.manage');
    expect(perms).not.toContain('closing.view');
  });

  it('returns base permissions for RECEPCAO', () => {
    const perms = getUserBasePermissions(makeUser('RECEPCAO'));
    expect(perms).toContain('clients.manage');
    expect(perms).toContain('notes.manage');
    expect(perms).not.toContain('closing.view');
  });

  it('returns only admin.access for ADMIN', () => {
    const perms = getUserBasePermissions(makeUser('ADMIN'));
    expect(perms).toEqual(['admin.access']);
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns false for null user', () => {
    expect(hasPermission(null, 'dashboard.view')).toBe(false);
  });

  it('ADMIN has every permission via admin.access expansion', () => {
    const admin = makeUser('ADMIN');
    const allPermissions: Permission[] = [
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
      'settings.view',
      'admin.access',
    ];
    for (const perm of allPermissions) {
      expect(hasPermission(admin, perm)).toBe(true);
    }
  });

  it('FINANCEIRO can view dashboard, clients, notes, kanban, closing, invoices', () => {
    const user = makeUser('FINANCEIRO');
    expect(hasPermission(user, 'dashboard.view')).toBe(true);
    expect(hasPermission(user, 'clients.view')).toBe(true);
    expect(hasPermission(user, 'notes.view')).toBe(true);
    expect(hasPermission(user, 'kanban.view')).toBe(true);
    expect(hasPermission(user, 'closing.view')).toBe(true);
    expect(hasPermission(user, 'invoices.view')).toBe(true);
  });

  it('FINANCEIRO cannot manage clients, notes, or access admin/settings', () => {
    const user = makeUser('FINANCEIRO');
    expect(hasPermission(user, 'clients.manage')).toBe(false);
    expect(hasPermission(user, 'notes.manage')).toBe(false);
    expect(hasPermission(user, 'settings.view')).toBe(false);
    expect(hasPermission(user, 'admin.access')).toBe(false);
  });

  it('PRODUCAO cannot view closing', () => {
    expect(hasPermission(makeUser('PRODUCAO'), 'closing.view')).toBe(false);
  });

  it('PRODUCAO can manage kanban and note statuses', () => {
    const user = makeUser('PRODUCAO');
    expect(hasPermission(user, 'kanban.manage')).toBe(true);
    expect(hasPermission(user, 'notes.status.manage')).toBe(true);
  });

  it('RECEPCAO gets clients.view implied by clients.manage', () => {
    expect(hasPermission(makeUser('RECEPCAO'), 'clients.view')).toBe(true);
  });

  it('RECEPCAO gets notes.view implied by notes.manage', () => {
    expect(hasPermission(makeUser('RECEPCAO'), 'notes.view')).toBe(true);
  });

  it('RECEPCAO cannot view closing or invoices', () => {
    const user = makeUser('RECEPCAO');
    expect(hasPermission(user, 'closing.view')).toBe(false);
    expect(hasPermission(user, 'invoices.view')).toBe(false);
  });
});

// ─── Module permission mapping ────────────────────────────────────────────────

describe('MODULE_PERMISSIONS', () => {
  it('maps admin module to admin.access', () => {
    expect(MODULE_PERMISSIONS.admin).toBe('admin.access');
  });

  it('maps settings module to settings.view', () => {
    expect(MODULE_PERMISSIONS.settings).toBe('settings.view');
  });

  it('maps closing module to closing.view', () => {
    expect(MODULE_PERMISSIONS.closing).toBe('closing.view');
  });
});

// ─── DEFAULT_ROLE_PERMISSIONS completeness ────────────────────────────────────

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('has entries for all 4 roles', () => {
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty('ADMIN');
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty('FINANCEIRO');
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty('PRODUCAO');
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty('RECEPCAO');
  });

  it('every role has at least one base permission', () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as (keyof typeof DEFAULT_ROLE_PERMISSIONS)[]) {
      expect(DEFAULT_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
