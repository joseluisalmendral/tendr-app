import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public page routes that never require a session (exact match).
const PUBLIC_PATHS = new Set(["/", "/login", "/auth/callback", "/privacy", "/terms"]);

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Route classification happens BEFORE creating the Supabase client. It only
  // reads the pathname and touches no cookies, so it is safe here.
  const isWebhook = pathname.startsWith("/api/webhooks");
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Webhooks carry no cookies and must not run any auth work: skip the client
  // entirely so we never touch session state for machine-to-machine calls.
  if (isWebhook) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do NOT run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to
  // debug issues with users being randomly logged out.

  // IMPORTANT: getClaims() refreshes the auth token. This call must not be
  // removed; doing so would prevent server-side session refresh.
  //
  // getClaims() returns { data: null, error } not only when logged out but also
  // on invalid signature, expired JWT, or failed network fallback — and can
  // rethrow non-AuthError exceptions (e.g. network failure). We capture the
  // error and treat a rethrown exception the same as a returned error so a
  // transient verification failure does not 500 the proxy.
  let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"] = null;
  let claimsError: unknown = null;
  try {
    const result = await supabase.auth.getClaims();
    data = result.data;
    claimsError = result.error;
  } catch (thrown) {
    claimsError = thrown;
  }

  // Distinguish a verification failure (error present or thrown) from a genuine
  // absence of a session (data === null && no error).
  const verificationFailed = claimsError !== null;
  const claims = data?.claims ?? null;
  const hasSession = claims !== null;
  const isAnonymous = claims?.is_anonymous === true;

  // Any redirect response we create must carry the session cookies the client
  // may have written via setAll; otherwise the browser and server fall out of
  // sync. Copy ALL cookies from supabaseResponse onto the redirect.
  const redirectTo = (path: string): NextResponse => {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  };

  // API routes (non-webhook) require a real session. We never create an
  // anonymous session for API clients — they get a clean 401 instead. A
  // verification failure also fails closed with a 401.
  if (isApi) {
    if (verificationFailed || !hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  // Page routes (protected or public, including /login): if token verification
  // failed transiently, pass through untouched. We must NOT signInAnonymously
  // or redirect here — doing so could destroy a possibly-valid session just
  // because verification failed for a transient reason.
  if (verificationFailed) {
    return supabaseResponse;
  }

  // /login special case: an authenticated (non-anonymous) visitor has no reason
  // to be here, so send them to the app. Anonymous users MUST be allowed
  // through — /login is exactly where they convert to a permanent account.
  if (pathname === "/login" && hasSession && !isAnonymous) {
    return redirectTo("/app");
  }

  // Public page routes need no session.
  if (isPublic) {
    return supabaseResponse;
  }

  // Protected page routes: a visitor with no session is NEVER forced to /login.
  // We mint an anonymous session so they can keep browsing. signInAnonymously
  // triggers setAll (dual-write), so the new cookies land on both request and
  // supabaseResponse and downstream RSCs see the session in the SAME request.
  if (!hasSession) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Anonymous sign-in failed (e.g. rate limit): fall back to /login.
      return redirectTo("/login");
    }
  }

  // IMPORTANT: Return the supabaseResponse object as-is. If you create a new
  // response with NextResponse.next(), make sure to:
  // 1. Pass the request: NextResponse.next({ request }).
  // 2. Copy over the cookies: newResponse.cookies.setAll(
  //      supabaseResponse.cookies.getAll()).
  // 3. Change only the newResponse object, not its cookies.
  // Failing to do this may cause the browser and server to fall out of sync
  // and terminate the user's session prematurely.
  return supabaseResponse;
}
