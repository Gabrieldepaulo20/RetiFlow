import { useEffect, useState } from 'react';
import {
  loadRoleModuleConfig,
  loadUserModuleOverrides,
  subscribeToModuleAccessChanges,
} from '@/services/auth/moduleAccess';

export function useRoleModuleConfig() {
  const [config, setConfig] = useState(() => loadRoleModuleConfig());

  useEffect(() => subscribeToModuleAccessChanges(() => setConfig(loadRoleModuleConfig())), []);

  return config;
}

export function useUserModuleOverrides() {
  const [overrides, setOverrides] = useState(() => loadUserModuleOverrides());

  useEffect(() => subscribeToModuleAccessChanges(() => setOverrides(loadUserModuleOverrides())), []);

  return overrides;
}
