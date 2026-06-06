// Helper de accesibilidad · F9
// e2e/helpers/a11y.ts

import { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

type Severity = 'critical' | 'serious' | 'moderate' | 'minor'

const BLOCKING_SEVERITIES: Severity[] = ['critical', 'serious']

/**
 * Inyecta axe-core en la página y lanza el audit.
 * Falla el test SI hay violations de severidad 'critical' o 'serious'.
 * Las 'moderate' y 'minor' se loguean para documentar en qa-checklist.md
 * pero no bloquean.
 */
export async function checkAccessibility(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const violations = results.violations

  const blocking = violations.filter((v) =>
    BLOCKING_SEVERITIES.includes(v.impact as Severity),
  )
  const nonBlocking = violations.filter(
    (v) => !BLOCKING_SEVERITIES.includes(v.impact as Severity),
  )

  if (nonBlocking.length > 0) {
    console.warn(`[a11y · ${context}] ${nonBlocking.length} violations no-bloqueantes:`)
    nonBlocking.forEach((v) =>
      console.warn(`  · [${v.impact}] ${v.id}: ${v.help}`),
    )
  }

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `  · [${v.impact}] ${v.id}: ${v.help} (nodes: ${v.nodes.length})`)
      .join('\n')
    throw new Error(
      `[a11y · ${context}] ${blocking.length} violations bloqueantes (critical/serious):\n${summary}`,
    )
  }
}

// ============================================================================
// Uso desde un spec
// ============================================================================
//
// import { checkAccessibility } from './helpers/a11y'
//
// test('homepage es accesible', async ({ page }) => {
//   await page.goto('/')
//   await checkAccessibility(page, 'homepage')
// })
