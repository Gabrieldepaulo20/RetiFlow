import { AppModuleKey, RoleModuleConfig, UserModuleOverrides, UserRole } from '@/types';
import { readJsonStorage, writeJsonStorage } from '@/services/storage/browserStorage';

export const ROLE_MODULE_CONFIG_STORAGE_KEY = 'moduleConfig';
export const USER_MODULE_OVERRIDES_STORAGE_KEY = 'systemUserModuleOverrides';

export const DEFAULT_ROLE_MODULE_CONFIG: RoleModuleConfig = {
  ADMIN: {
    dashboard: true,
    clients: true,
    notes: true,
    kanban: true,
    closing: true,
    payables: true,
    settings: true,
    admin: true,
  },
  FINANCEIRO: {
    dashboard: true,
    clients: true,
    notes: true,
    kanban: true,
    closing: true,
    payables: true,
    settings: false,
    admin: false,
  },
  PRODUCAO: {
    dashboard: true,
    clients: false,
    notes: true,
    kanban: true,
    closing: false,
    payables: false,
    settings: false,
    admin: false,
  },
  RECEPCAO: {
    dashboard: true,
    clients: true,
    notes: true,
    kanban: true,
    closing: false,
    payables: false,
    settings: false,
    admin: false,
  },
};

const STORAGE_EVENT = 'app-storage-updated';

function emitStorageUpdate(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key } }));
}

export function loadRoleModuleConfig(): RoleModuleConfig {
  const stored = readJsonStorage<RoleModuleConfig>(ROLE_MODULE_CONFIG_STORAGE_KEY, DEFAULT_ROLE_MODULE_CONFIG);
  return {
    ADMIN: {
      ...DEFAULT_ROLE_MODULE_CONFIG.ADMIN,
      ...stored.ADMIN,
    },
    FINANCEIRO: {
      ...DEFAULT_ROLE_MODULE_CONFIG.FINANCEIRO,
      ...stored.FINANCEIRO,
    },
    PRODUCAO: {
      ...DEFAULT_ROLE_MODULE_CONFIG.PRODUCAO,
      ...stored.PRODUCAO,
    },
    RECEPCAO: {
      ...DEFAULT_ROLE_MODULE_CONFIG.RECEPCAO,
      ...stored.RECEPCAO,
    },
  };
}

export function saveRoleModuleConfig(config: RoleModuleConfig) {
  writeJsonStorage(ROLE_MODULE_CONFIG_STORAGE_KEY, config);
  emitStorageUpdate(ROLE_MODULE_CONFIG_STORAGE_KEY);
}

export function loadUserModuleOverrides(): UserModuleOverrides {
  return readJsonStorage<UserModuleOverrides>(USER_MODULE_OVERRIDES_STORAGE_KEY, {});
}

export function saveUserModuleOverrides(overrides: UserModuleOverrides) {
  writeJsonStorage(USER_MODULE_OVERRIDES_STORAGE_KEY, overrides);
  emitStorageUpdate(USER_MODULE_OVERRIDES_STORAGE_KEY);
}

export function isRoleModuleEnabled(role: UserRole, moduleKey: AppModuleKey, config = loadRoleModuleConfig()): boolean {
  return config[role]?.[moduleKey] !== false;
}

export function isUserModuleEnabled(userId: string, moduleKey: AppModuleKey, overrides = loadUserModuleOverrides()): boolean {
  return overrides[userId]?.[moduleKey] !== false;
}

export function subscribeToModuleAccessChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleChange = () => callback();
  const handleCustomUpdate = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (!detail?.key || detail.key === ROLE_MODULE_CONFIG_STORAGE_KEY || detail.key === USER_MODULE_OVERRIDES_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener('storage', handleChange);
  window.addEventListener(STORAGE_EVENT, handleCustomUpdate);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(STORAGE_EVENT, handleCustomUpdate);
  };
}
