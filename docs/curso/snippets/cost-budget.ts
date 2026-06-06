// Cost budget middleware · F7
// lib/ai/cost-budget.ts del proyecto.

import { and, eq, gte, sum } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { aiUsageLedger, workspaces } from '@/db/schema'

export class BudgetExceededError extends Error {
  status = 429
  constructor(message: string) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

export type BudgetStatus = {
  usedCents: number
  budgetCents: number
  percentUsed: number  // 0-100+
  withinBudget: boolean
  warningThreshold: boolean  // true cuando >= 80%
}

/**
 * Calcula uso del mes en curso. Reset implícito por filtro temporal,
 * no por borrado.
 */
export async function getBudgetStatus(workspaceId: string): Promise<BudgetStatus> {
  const [usage] = await db
    .select({
      total: sum(aiUsageLedger.costCents).as('total'),
    })
    .from(aiUsageLedger)
    .where(
      and(
        eq(aiUsageLedger.workspaceId, workspaceId),
        gte(aiUsageLedger.createdAt, sql`date_trunc('month', now())`),
      ),
    )

  const [ws] = await db
    .select({ budget: workspaces.aiMonthlyBudgetCents })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))

  const usedCents = Number(usage?.total ?? 0)
  const budgetCents = ws?.budget ?? 5000  // default 50 EUR
  const percentUsed = budgetCents > 0 ? (usedCents / budgetCents) * 100 : 0

  return {
    usedCents,
    budgetCents,
    percentUsed,
    withinBudget: usedCents < budgetCents,
    warningThreshold: percentUsed >= 80,
  }
}

/**
 * Llamar ANTES de cada llamada al modelo. Si excede budget, lanza 429.
 *
 * estimatedCostCents es opcional; si no se pasa, no se suma a lo usado y
 * el chequeo es contra el acumulado actual. Pasarlo cuando el caller
 * puede estimar (ej: por tokens del input).
 */
export async function assertWithinBudget(
  workspaceId: string,
  estimatedCostCents = 0,
): Promise<BudgetStatus> {
  const status = await getBudgetStatus(workspaceId)
  if (status.usedCents + estimatedCostCents >= status.budgetCents) {
    throw new BudgetExceededError(
      'Budget mensual superado. Súbelo en /settings/ai o espera al próximo mes.',
    )
  }
  return status
}

// ============================================================================
// Patrón de uso en Server Actions / Inngest functions
// ============================================================================
//
// export async function adaptTemplate(input) {
//   const ws = await getCurrentWorkspace()
//   const status = await assertWithinBudget(ws.workspaceId)  // 429 si excede
//
//   // ... llamada al modelo + INSERT ai_usage_ledger ...
//
//   // status.warningThreshold se puede devolver al UI para mostrar toast 80%.
//   return { ok: true, budgetWarning: status.warningThreshold }
// }
