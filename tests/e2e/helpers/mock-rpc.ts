import { Page, expect } from '@playwright/test';

/**
 * Prepares the page for E2E testing by clearing state.
 * Should be called BEFORE the first navigation in a test.
 */
export async function setupE2E(page: Page) {
  // We don't use addInitScript here because it runs on EVERY navigation,
  // which would clear the session when moving between pages.
  await page.goto('/'); // Navigate to a neutral page first to access storage
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

/**
 * Ensures the page is fully hydrated and loading screens are gone.
 */
export async function ensureHydrated(page: Page) {
  const loading = page.locator('[aria-busy="true"]');
  // Espera sumir ou ignora se não aparecer em 5s
  await loading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}

export async function clearAppState(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}
