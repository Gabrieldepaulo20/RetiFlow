import { users as seedUsers } from '@/data/seed';
import { SystemUser } from '@/types';
import { readJsonStorage, writeJsonStorage } from '@/services/storage/browserStorage';
import { getUsuarios } from '@/api/supabase/usuarios';
import { dbUserToSystemUser } from '@/services/auth/supabaseUserMapping';

const SYSTEM_USERS_STORAGE_KEY = 'systemUsers';
const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export function loadSystemUsers(): SystemUser[] {
  return readJsonStorage<SystemUser[]>(SYSTEM_USERS_STORAGE_KEY, seedUsers);
}

export function saveSystemUsers(users: SystemUser[]) {
  writeJsonStorage(SYSTEM_USERS_STORAGE_KEY, users);
}

export async function listSystemUsers() {
  if (IS_REAL_AUTH) {
    const { dados } = await getUsuarios({ p_limite: 500 });
    return dados.map(dbUserToSystemUser);
  }

  return loadSystemUsers();
}
