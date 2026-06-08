import type { Metadata } from "next";

import { CheckIcon, SparkleIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";

// NOTE: imported from `/dist/ssr` (not the default client entry) so this Server
// Component renders the static SSR icon variant without pulling the icon
// runtime's client context into the RSC payload.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { CheckoutButton } from "./checkout-button";

export const metadata: Metadata = {
  title: "Mejora tu plan · Tendr",
};

/**
 * /upgrade — in-app plan selection (F8). Lives under the (app) route group so
 * it inherits the auth boundary and the AppShell chrome; the URL is still
 * `/upgrade` (route groups do not affect the path). It is reachable as the
 * Stripe `cancel_url` and from upsell entry points, all of which are
 * post-login.
 *
 * Layout is deliberately asymmetric (DESIGN_VARIANCE 4-5): Pro is the featured
 * plan (wider, accent ring, "Recomendado" badge); Team is the quieter
 * secondary card. The checkout CTA is an isolated client island so the page
 * itself stays a Server Component; price ids never reach the browser (the
 * island sends a plan tier, the server maps it to STRIPE_PRICE_*).
 */

const PRO_FEATURES = [
  "Todo el CRM del plan Free",
  "Adaptar plantillas con IA",
  "Extractor de documentos con IA",
  "Resumen de relación y sugerencia de acción con IA",
  "Trae tu propia API key (BYO key)",
];

const TEAM_FEATURES = [
  "Todo lo del plan Pro",
  "Multiusuario por workspace (próximamente)",
  "Roles y permisos del equipo (próximamente)",
];

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <CheckIcon
        weight="bold"
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden
      />
      <span className="text-foreground/90">{children}</span>
    </li>
  );
}

export default function UpgradePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:py-16">
      <header className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Desbloquea la IA de Tendr
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Tu plan cubre la app. El consumo de tokens va aparte con tu propia API
          key, así pagas al proveedor solo lo que uses.
        </p>
      </header>

      <div className="mt-10 grid items-start gap-5 md:grid-cols-5">
        {/* Pro — featured. Wider (3/5 cols), accent ring, recommended badge. */}
        <section
          className={cn(
            "relative flex flex-col gap-6 rounded-2xl bg-card p-6 text-card-foreground md:col-span-3 md:p-8",
            "ring-2 ring-primary/60",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SparkleIcon
                  weight="fill"
                  className="size-5 text-primary"
                  aria-hidden
                />
                <h2 className="font-heading text-xl font-medium">Pro</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Todas las funciones de IA para llevar tus plantillas y tu
                relación con clientes a otro nivel.
              </p>
            </div>
            <Badge className="shrink-0 bg-primary/12 text-primary">
              Recomendado
            </Badge>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-heading text-4xl font-semibold tracking-tight">
              €9
            </span>
            <span className="text-sm text-muted-foreground">/mes</span>
          </div>

          <ul className="flex flex-col gap-3">
            {PRO_FEATURES.map((f) => (
              <FeatureItem key={f}>{f}</FeatureItem>
            ))}
          </ul>

          <div className="mt-auto pt-2">
            <CheckoutButton tier="pro" label="Subscribirme a Pro" />
          </div>
        </section>

        {/* Team — quieter secondary card (2/5 cols), hairline ring only. */}
        <section className="flex flex-col gap-6 rounded-2xl bg-card p-6 text-card-foreground ring-1 ring-foreground/10 md:col-span-2 md:p-8">
          <div>
            <div className="flex items-center gap-2">
              <UsersThreeIcon
                className="size-5 text-muted-foreground"
                aria-hidden
              />
              <h2 className="font-heading text-xl font-medium">Team</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Todo lo de Pro, pensado para crecer en equipo cuando llegue el
              momento.
            </p>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-heading text-4xl font-semibold tracking-tight">
              €29
            </span>
            <span className="text-sm text-muted-foreground">/mes</span>
          </div>

          <ul className="flex flex-col gap-3">
            {TEAM_FEATURES.map((f) => (
              <FeatureItem key={f}>{f}</FeatureItem>
            ))}
          </ul>

          <div className="mt-auto pt-2">
            <CheckoutButton
              tier="team"
              label="Subscribirme a Team"
              variant="outline"
            />
          </div>
        </section>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Modo de prueba: usa la tarjeta 4242 4242 4242 4242 con cualquier CVC y
        fecha futura. No se realiza ningún cobro real.
      </p>
    </div>
  );
}
