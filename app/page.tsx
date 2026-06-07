import { redirect } from "next/navigation";

/**
 * Root entry point. There is no public marketing page yet, so visiting `/`
 * sends the user straight into the product at `/app`.
 *
 * The redirect lives here (page-level) rather than in the proxy/middleware on
 * purpose: the middleware keeps its single responsibility (session/auth
 * gating) and `/` stays a public pass-through there, while the route intent is
 * colocated and discoverable in the route tree. The anonymous session is not
 * minted on `/` (it is public); it is minted by the middleware when this
 * redirect lands on the protected `/app` route.
 */
export default function Home() {
  redirect("/app");
}
