import { describe, expect, it } from 'vitest';
import { resolveDocumentSettingsQueryScope } from '@/hooks/useDocumentTemplateSettings';

describe('document template query scope', () => {
  it('uses the validated support target and session for implicit consumers', () => {
    expect(resolveDocumentSettingsQueryScope(undefined, undefined, {
      targetUserId: 'target-a',
      sessionId: 'session-a',
    })).toEqual({
      idUsuarios: 'target-a',
      queryScope: 'session-a',
    });

    expect(resolveDocumentSettingsQueryScope(undefined, undefined, {
      targetUserId: 'target-b',
      sessionId: 'session-b',
    })).toEqual({
      idUsuarios: 'target-b',
      queryScope: 'session-b',
    });
  });

  it('preserves an explicit user and query scope', () => {
    expect(resolveDocumentSettingsQueryScope('explicit-user', 'explicit-scope', {
      targetUserId: 'target-a',
      sessionId: 'session-a',
    })).toEqual({
      idUsuarios: 'explicit-user',
      queryScope: 'explicit-scope',
    });
  });

  it('keeps normal mode on the current-user cache key', () => {
    expect(resolveDocumentSettingsQueryScope(undefined, undefined, null)).toEqual({
      idUsuarios: null,
      queryScope: null,
    });
  });
});
