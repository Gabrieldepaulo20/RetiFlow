export const PASSWORD_MIN_LENGTH = 10;

export type PasswordPolicyCheck = {
  key: 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol';
  label: string;
  valid: boolean;
};

export function getPasswordPolicyChecks(password: string): PasswordPolicyCheck[] {
  return [
    {
      key: 'length',
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      valid: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      key: 'lowercase',
      label: 'Uma letra minúscula',
      valid: /[a-zà-ÿ]/.test(password),
    },
    {
      key: 'uppercase',
      label: 'Uma letra maiúscula',
      valid: /[A-ZÀ-Ÿ]/.test(password),
    },
    {
      key: 'number',
      label: 'Um número',
      valid: /\d/.test(password),
    },
    {
      key: 'symbol',
      label: 'Um símbolo',
      valid: /[^A-Za-zÀ-ÿ0-9]/.test(password),
    },
  ];
}

export function validatePasswordPolicy(password: string) {
  const checks = getPasswordPolicyChecks(password);
  return {
    checks,
    valid: checks.every((check) => check.valid),
  };
}
