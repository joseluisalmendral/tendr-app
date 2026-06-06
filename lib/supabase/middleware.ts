import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
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
  await supabase.auth.getClaims();

  // Route protection for unauthenticated users will be added here once
  // protected routes exist. No redirect logic in this phase.

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
