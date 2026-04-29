import type { Page } from '@playwright/test';

export const MOCK_PASSWORD = 'demo123';

export const USERS = {
  financeiro: { email: 'financeiro@retifica.com', password: MOCK_PASSWORD },
  admin: { email: 'admin@retifica.com', password: MOCK_PASSWORD },
} as const;

export async function loginAs(page: Page, role: keyof typeof USERS) {
  const { email, password } = USERS[role];
  const isAdmin = role === 'admin';

  await page.goto(isAdmin ? '/admin/login' : '/login');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();

  // Wait for redirect away from login
  await page.waitForURL(/\/(dashboard|admin)$/);
}

export async function clearSession(page: Page) {
  // Must be on the app origin before accessing localStorage
  await page.goto('/login');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}
