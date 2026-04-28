import { Page, expect } from '@playwright/test';

/**
 * Prepares the page for E2E testing by clearing state.
 * Should be called BEFORE the first navigation in a test.
 */
export async function setupE2E(page: Page) {
  // We navigate to a neutral page to ensure we can access/clear storage
  // without side effects from application code running.
  await page.goto('/login'); 
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

/**
 * Ensures the page is fully hydrated and loading screens are gone.
 */
export async function ensureHydrated(page: Page) {
  console.log(`[Hydrate] Waiting for hydration on ${page.url()}`);
  const loading = page.locator('[aria-busy="true"]');
  
  // Wait for loading screen to disappear
  await loading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
    console.log('[Hydrate] Timeout waiting for aria-busy="true" to hide');
  });

  // Also ensure the main container is present and has content
  await page.locator('#root').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    console.log('[Hydrate] Timeout waiting for #root');
  });

  await page.waitForTimeout(1000);
  console.log('[Hydrate] Ready');
}

export async function clearAppState(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}
