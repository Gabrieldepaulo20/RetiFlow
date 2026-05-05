import { describe, expect, it } from 'vitest';
import { getPasswordPolicyChecks, PASSWORD_MIN_LENGTH, validatePasswordPolicy } from '@/services/auth/passwordPolicy';

describe('passwordPolicy', () => {
  it('requires a production-strength password shape', () => {
    const result = validatePasswordPolicy('Retiflow@2026');
    expect(result.valid).toBe(true);
    expect(result.checks.every((check) => check.valid)).toBe(true);
  });

  it('reports each missing requirement clearly', () => {
    const checks = getPasswordPolicyChecks('senha');
    const failed = checks.filter((check) => !check.valid).map((check) => check.key);

    expect(failed).toContain('length');
    expect(failed).toContain('uppercase');
    expect(failed).toContain('number');
    expect(failed).toContain('symbol');
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});
