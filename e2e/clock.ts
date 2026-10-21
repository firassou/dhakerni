import type { Page } from "@playwright/test";

/**
 * Starts the page's clock at 12:00 local time today and lets it keep running.
 * Specs that add a task "in N minutes" and expect it under Today need this: near midnight the
 * due time falls on tomorrow. Call it before the first `page.goto`.
 */
export async function pinMidday(page: Page) {
  const time = new Date();
  time.setHours(12, 0, 0, 0);
  await page.clock.install({ time });
}
