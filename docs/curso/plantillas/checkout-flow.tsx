// Plantilla del flujo de upgrade · F8
// app/upgrade/page.tsx

import { redirect } from 'next/navigation'
import { createCheckoutSession } from '@/app/actions/subscriptions'

const PLANS = [
  {
    id: 'pro' as const,
    priceId: process.env.STRIPE_PRICE_PRO!,
    name: 'Tendr Pro',
    price: '9 EUR / mes',
    features: [
      'Todo el CRM del plan Free',
      'Adaptación de plantillas con IA',
      'Extractor de documentos con IA',
      'Resumen de relación y sugerencia de acción con IA',
      'BYO API key (paga al provider directamente)',
      'Observabilidad en Langfuse',
    ],
    cta: 'Subscribirme a Pro',
  },
  {
    id: 'team' as const,
    priceId: process.env.STRIPE_PRICE_TEAM!,
    name: 'Tendr Team',
    price: '29 EUR / mes',
    features: [
      'Todo lo de Pro',
      'Multi-usuario por workspace (roadmap)',
      'Roles y permisos (roadmap)',
      'Soporte prioritario',
    ],
    cta: 'Subscribirme a Team',
  },
]

export default function UpgradePage() {
  async function handleCheckout(formData: FormData) {
    'use server'
    const priceId = formData.get('priceId') as string
    const result = await createCheckoutSession({ priceId })
    if (!result.ok || !result.url) {
      throw new Error('No se pudo iniciar el checkout')
    }
    redirect(result.url)
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="text-center mb-12">
        <h1 className="text-3xl font-semibold">Elige tu plan</h1>
        <p className="text-muted-foreground mt-2">
          Tu API key de IA va aparte (BYO key). El plan cubre la app, no el
          consumo de tokens.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className="border rounded-lg p-6 flex flex-col"
          >
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="text-2xl font-bold mt-2">{plan.price}</p>

            <ul className="mt-6 space-y-2 flex-grow">
              {plan.features.map((f) => (
                <li key={f} className="text-sm flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <form action={handleCheckout} className="mt-6">
              <input type="hidden" name="priceId" value={plan.priceId} />
              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground rounded-md py-2 font-medium"
              >
                {plan.cta}
              </button>
            </form>
          </article>
        ))}
      </div>

      <p className="text-muted-foreground text-xs text-center mt-8">
        Test mode · usar tarjeta 4242 4242 4242 4242 con cualquier CVC y
        fecha futura. No hay cobro real.
      </p>
    </main>
  )
}
