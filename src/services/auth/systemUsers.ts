import { users as seedUsers } from '@/data/seed';
import { SystemUser } from '@/types';
import { readJsonStorage, writeJsonStorage } from '@/services/storage/browserStorage';

const SYSTEM_USERS_STORAGE_KEY = 'systemUsers';

export function loadSystemUsers(): SystemUser[] {
  return readJsonStorage<SystemUser[]>(SYSTEM_USERS_STORAGE_KEY, seedUsers);
}

export function saveSystemUsers(users: SystemUser[]) {
  writeJsonStorage(SYSTEM_USERS_STORAGE_KEY, users);
}

export async function listSystemUsers() {
  return loadSystemUsers();
}
