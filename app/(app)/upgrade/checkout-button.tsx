"use client";

import { useTransition } from "react";

import { ArrowRightIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startCheckout, type PlanTier } from "@/app/actions/subscriptions";

/**
 * Client island that starts a Stripe Checkout for one plan tier.
 *
 * The client sends only the tier name (never a price id — STRIPE_PRICE_* are
 * server-only env, see startCheckout). On success the browser is redirected to
 * the Stripe-hosted Checkout url. The transition keeps the button in a pending
 * state across the server round-trip AND the redirect navigation, so the user
 * sees a spinner the whole time (F7c reviews flagged missing loading states).
 */
export function CheckoutButton({
  tier,
  label,
  variant = "default",
}: {
  tier: PlanTier;
  label: string;
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startCheckout(tier);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Full-page navigation to the Stripe-hosted Checkout. Kept inside the
      // transition so `pending` stays true until the browser actually leaves.
      window.location.assign(result.url);
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      onClick={handleClick}
    >
      {pending ? (
        <>
          <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
          Redirigiendo a Stripe...
        </>
      ) : (
        <>
          {label}
          <ArrowRightIcon data-icon="inline-end" />
        </>
      )}
    </Button>
  );
}
