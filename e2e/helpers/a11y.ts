import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * Runs axe-core against the current page state.
 * Fails the test only on 'serious' or 'critical' violations.
 * Logs (without failing) 'moderate' and 'minor' violations.
 */
export async function checkAccessibility(page: Page, context?: string): Promise<void> {
  const label = context ? ` [${context}]` : '';
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact));
  const advisory = results.violations.filter((v) => v.impact == null || !BLOCKING_IMPACTS.has(v.impact));
  for (const v of advisory) {
    console.warn(`a11y${label} non-blocking [${v.impact ?? 'unknown'}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.helpUrl}`);
  }
  if (blocking.length > 0) {
    const summary = blocking.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`).join('\n');
    expect(blocking, `Accessibility violations${label}:\n${summary}`).toEqual([]);
  }
}
