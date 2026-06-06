// E2E spec de flujo crítico · F9
// e2e/02-workspace-core.spec.ts (ejemplo canónico)

import { test, expect } from '@playwright/test'
import { checkAccessibility } from './helpers/a11y'

test.describe('Workspace core: cliente → caso → Kanban → nota', () => {
  test('happy path completo end-to-end', async ({ page }) => {
    // 1. Visitar /; sesión anónima creada automáticamente por el proxy
    await page.goto('/')
    await expect(page).toHaveURL(/\/app|\/$/)
    await checkAccessibility(page, 'landing-after-anon-session')

    // 2. Crear cliente
    await page.goto('/clients')
    await page.getByRole('button', { name: /nuevo cliente/i }).click()
    await page.getByLabel(/nombre/i).fill('Cliente E2E')
    await page.getByLabel(/empresa/i).fill('Empresa Test')
    await page.getByRole('button', { name: /guardar/i }).click()

    const clientRow = page.getByRole('row', { name: /Cliente E2E/i })
    await expect(clientRow).toBeVisible()
    await checkAccessibility(page, 'clients-with-data')

    // 3. Navegar al detalle del cliente
    await clientRow.getByRole('link', { name: /ver|abrir/i }).click()
    await expect(page).toHaveURL(/\/clients\/[a-f0-9-]+/)

    // 4. Crear caso desde la tab "Casos"
    await page.getByRole('tab', { name: /casos/i }).click()
    await page.getByRole('button', { name: /nuevo caso/i }).click()
    await page.getByLabel(/título/i).fill('Caso E2E #1')
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(page.getByText('Caso E2E #1')).toBeVisible()

    // 5. Crear nota desde la tab "Notas"
    await page.getByRole('tab', { name: /notas/i }).click()
    await page.getByRole('textbox', { name: /nota/i }).fill('Nota de prueba E2E')
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(page.getByText('Nota de prueba E2E')).toBeVisible()
    await checkAccessibility(page, 'client-detail-with-tabs')

    // 6. Ir al Kanban global y mover el caso de prospect → proposal
    await page.goto('/kanban')

    const card = page.getByRole('article', { name: /Caso E2E #1/i })
    const proposalColumn = page.getByRole('region', { name: /propuesta/i })

    await card.dragTo(proposalColumn)

    // Verificar visualmente que la card está en la nueva columna
    await expect(proposalColumn.getByText('Caso E2E #1')).toBeVisible()

    // 7. Reload para verificar persistencia (no solo optimistic)
    await page.reload()
    await expect(proposalColumn.getByText('Caso E2E #1')).toBeVisible()

    await checkAccessibility(page, 'kanban-after-drag')
  })

  test('keyboard nav del Kanban (a11y)', async ({ page }) => {
    await page.goto('/kanban')

    // Tab hasta la primera card
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Space para grab según DnD Kit
    await page.keyboard.press('Space')

    // Flecha derecha para mover de columna
    await page.keyboard.press('ArrowRight')

    // Enter para soltar
    await page.keyboard.press('Enter')

    // Verificar accesibilidad explícita del DnD
    await checkAccessibility(page, 'kanban-keyboard-nav')
  })

  test('empty state · workspace sin clientes', async ({ browser }) => {
    // Crear un context nuevo para tener un workspace anónimo limpio
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/clients')

    await expect(page.getByText(/sin clientes|comienza creando/i)).toBeVisible()
    await checkAccessibility(page, 'clients-empty-state')

    await context.close()
  })
})

// ============================================================================
// Multi-tab Realtime (spec 06)
// ============================================================================
test.describe('Realtime multi-tab', () => {
  test('mover caso en tab A actualiza tab B', async ({ browser }) => {
    // IMPORTANTE: usar el MISMO context (misma cookie) para que las dos
    // pages sean del mismo workspace. NO usar dos contexts (serían dos
    // workspaces anónimos distintos).
    const context = await browser.newContext()
    const pageA = await context.newPage()
    const pageB = await context.newPage()

    // Setup en pageA: crear cliente + caso
    await pageA.goto('/clients')
    await pageA.getByRole('button', { name: /nuevo cliente/i }).click()
    await pageA.getByLabel(/nombre/i).fill('Cliente Realtime')
    await pageA.getByRole('button', { name: /guardar/i }).click()
    // ... crear caso

    // pageB navega al Kanban
    await pageB.goto('/kanban')
    const cardInB = pageB.getByRole('article', { name: /Caso Realtime/i })
    await expect(cardInB).toBeVisible()

    // pageA mueve el caso
    await pageA.goto('/kanban')
    const cardInA = pageA.getByRole('article', { name: /Caso Realtime/i })
    await cardInA.dragTo(pageA.getByRole('region', { name: /activo/i }))

    // pageB debe actualizar en < 2s (timeout default del expect)
    await expect(
      pageB.getByRole('region', { name: /activo/i }).getByText(/Caso Realtime/i),
    ).toBeVisible({ timeout: 3000 })

    await context.close()
  })
})
