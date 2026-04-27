import { Page, expect } from '@playwright/test';

/**
 * Prepares the page for E2E testing by clearing state.
 */
export async function setupE2E(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    // Inicia o app como se fosse a primeira vez para carregar os defaults do seed.ts
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
