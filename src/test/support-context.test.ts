import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertActiveSupportScopeUnchanged,
  captureActiveSupportScope,
  readActiveSupportContext,
  readStoredSupportSession,
  setActiveSupportSession,
  SUPPORT_SESSION_STORAGE_KEY,
  writeStoredSupportSession,
} from '@/services/auth/supportContext';
import type { SupportImpersonationSession } from '@/types';

const supportSession: SupportImpersonationSession = {
  id: '11111111-1111-4111-8111-111111111111',
  reason: 'Atendimento operacional autorizado',
  startedAt: '2026-07-30T12:00:00.000Z',
  expiresAt: null,
  actorUser: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Guilherme Henrique',
    email: 'guilhermehenriquedepaulo2@gmail.com',
    role: 'ADMIN',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    moduleAccess: { admin: true },
  },
  targetUser: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Retífica Premium',
    email: 'retificapremium5@gmail.com',
    role: 'RECEPCAO',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('support context storage and runtime authority', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setActiveSupportSession(null);
  });

  it('persists the candidate only in the current browser tab', () => {
    writeStoredSupportSession(supportSession);

    expect(window.sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
    expect(readStoredSupportSession()).toEqual(supportSession);
  });

  it('does not activate API context from storage before server validation', () => {
    writeStoredSupportSession(supportSession);

    expect(readActiveSupportContext()).toBeNull();

    setActiveSupportSession(supportSession);
    expect(readActiveSupportContext()).toEqual({
      sessionId: supportSession.id,
      targetUserId: supportSession.targetUser.id,
    });
  });

  it('migrates one legacy localStorage candidate to tab-local storage', () => {
    window.localStorage.setItem(
      SUPPORT_SESSION_STORAGE_KEY,
      JSON.stringify(supportSession),
    );

    expect(readStoredSupportSession()).toEqual(supportSession);
    expect(window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeTruthy();
    expect(readActiveSupportContext()).toBeNull();
  });

  it('always removes the legacy cross-tab candidate when a tab candidate already exists', () => {
    const legacySession = {
      ...supportSession,
      id: '44444444-4444-4444-8444-444444444444',
    };
    window.sessionStorage.setItem(
      SUPPORT_SESSION_STORAGE_KEY,
      JSON.stringify(supportSession),
    );
    window.localStorage.setItem(
      SUPPORT_SESSION_STORAGE_KEY,
      JSON.stringify(legacySession),
    );

    expect(readStoredSupportSession()).toEqual(supportSession);
    expect(window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('aborts a multi-step operation when support ends or changes target', () => {
    setActiveSupportSession(supportSession);
    const snapshot = captureActiveSupportScope();

    setActiveSupportSession(null);

    expect(() => assertActiveSupportScopeUnchanged(snapshot)).toThrow(
      'O contexto de acesso mudou durante a operação',
    );
  });

  it('aborts a normal-user operation if support becomes active mid-flight', () => {
    const snapshot = captureActiveSupportScope();

    setActiveSupportSession(supportSession);

    expect(() => assertActiveSupportScopeUnchanged(snapshot)).toThrow(
      'O contexto de acesso mudou durante a operação',
    );
  });
});
