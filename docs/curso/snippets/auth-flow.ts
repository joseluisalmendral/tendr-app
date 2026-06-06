// Esqueleto de referencia del flujo auth anónimo → autenticado de Tendr · F4
// El alumno NO copia este archivo literal; el agente lo genera adaptado al
// proyecto. Sirve para validar que el flujo final coincide en patrón.
//
// v2 — APIs verificadas contra @supabase/ssr 0.10.3 y @supabase/auth-js 2.107.0
// (Context7 + tipos instalados + tests reales contra Supabase local):
//   - linkIdentity({ provider: 'email' }) NO EXISTE (solo OAuth/OIDC; no
//     compila). La conversión anónimo → permanente es updateUser({ email }).
//   - exchangeCodeForSession(code) NO sirve en flujos iniciados en el
//     servidor: @supabase/ssr fija PKCE y el code_verifier nunca existe.
//     El callback verifica con verifyOtp({ type, token_hash }).
//   - La huella en audit_log NO usa service_role: función SECURITY DEFINER
//     log_promotion() invocada por RPC con el client del propio usuario.

// ============================================================================
// lib/supabase/server.ts
// ============================================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Components no pueden modificar cookies; solo Server
            // Actions / Route Handlers. Es seguro tragarse el error si el
            // proxy refresca la sesión.
          }
        },
      },
    },
  )
}

// ============================================================================
// proxy.ts (raíz del proyecto)
// En Next.js 16 el antiguo middleware.ts se renombra a proxy.ts y la función
// exportada pasa a llamarse proxy. El runtime es nodejs y no se configura
// (edge no está soportado en Proxy).
//
// PATRÓN CRÍTICO — doble escritura de cookies: setAll debe escribir en
// request.cookies Y en un NextResponse recreado con { request }. Si solo se
// escribe en la response, los Server Components de ESTE MISMO request no ven
// la sesión que signInAnonymously() acaba de crear y el primer landing del
// anónimo se renderiza "sin sesión".
// ============================================================================
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient as createProxyClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/', '/login', '/auth/callback', '/privacy', '/terms']

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Webhooks: sin sesión y sin crear el client siquiera.
  if (path.startsWith('/api/webhooks/')) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createProxyClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          // Doble escritura: el request (para los RSC de este request) y la
          // response recreada (para el navegador).
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() valida el JWT en local (sin red en proyectos con clave
  // asimétrica). OJO: devuelve { data: null, error } ante firma inválida,
  // JWT expirado o fallo de red — y puede RELANZAR errores de red. Tratar
  // "error de verificación" como "sin sesión" mintaría una sesión anónima
  // PISANDO una sesión real: hay que distinguir los dos casos.
  let claims: { is_anonymous?: boolean } | null = null
  let verificationFailed = false
  try {
    const { data, error } = await supabase.auth.getClaims()
    claims = data?.claims ?? null
    verificationFailed = error !== null
  } catch {
    verificationFailed = true
  }
  const hasSession = claims !== null
  const isAnonymous = claims?.is_anonymous === true

  // /api/* (no-webhook): 401 limpio. NUNCA mintar sesiones anónimas para
  // clientes de API. Fallo de verificación → fail closed.
  if (path.startsWith('/api/')) {
    if (verificationFailed || !hasSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // Fallo transitorio de verificación en rutas de página: pasar sin tocar
  // nada (ni signInAnonymously ni redirects sobre una sesión quizá válida).
  if (verificationFailed) return response

  // /login: redirigir a /app SOLO a usuarios permanentes. Una sesión anónima
  // ES una sesión: si se redirige también al anónimo, queda atrapado y nunca
  // puede convertir su cuenta (mata el funnel de promoción).
  if (path === '/login' && hasSession && !isAnonymous) {
    const redirect = NextResponse.redirect(new URL('/app', request.url))
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // Si NO hay sesión y la ruta no es pública, crear sesión anónima.
  // El usuario nunca ve /login forzado; se hace transparente.
  if (!hasSession && !PUBLIC_ROUTES.includes(path)) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      // Fallback (p. ej. rate limit): ahí sí, /login.
      const redirect = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
      return redirect
    }
  }

  return response
}

export const config = {
  matcher: [
    // Excluir estáticos de verdad, no solo .svg.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)',
  ],
}

// ============================================================================
// lib/auth/get-current-workspace.ts
// ============================================================================
// import 'server-only'          // nadie lo importa desde un Client Component
// import { cache } from 'react' // dedupe por request: N llamadas en un mismo
//                               // árbol RSC = 1 getUser + 1 query

export const getCurrentWorkspace = /* cache( */ async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ws, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  // CLAVE: distinguir "fallo de query" de "todavía sin workspace". RLS filtra
  // los SELECT en silencio; si además tragamos el error, un fallo de BD se
  // disfraza de "no hay workspace" y el caller dispara creaciones espurias.
  if (error) {
    throw new Error('Failed to resolve current workspace', { cause: error })
  }

  return {
    user,
    workspaceId: ws?.id ?? null, // null → el caller llama ensureAnonymousWorkspace
    isAnonymous: user.is_anonymous ?? false, // flag del JWT, NUNCA inferir del email
  }
} /* ) */

// ============================================================================
// app/(auth)/actions.ts · Server Action ensureAnonymousWorkspace
// ============================================================================
'use server'

import { z } from 'zod'

export async function ensureAnonymousWorkspace() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No session')

  // Idempotente y race-safe: owner_id es UNIQUE; upsert con ON CONFLICT DO
  // NOTHING converge en la misma fila ante llamadas concurrentes (doble
  // render, doble pestaña). El check-then-insert clásico tiene TOCTOU: dos
  // llamadas pasan el check y la segunda revienta con unique violation.
  // ignoreDuplicates: true emite DO NOTHING → no necesita policy de UPDATE.
  const { error: upsertError } = await supabase.from('workspaces').upsert(
    { owner_id: user.id, name: 'Mi workspace' },
    { onConflict: 'owner_id', ignoreDuplicates: true },
  )
  if (upsertError) throw upsertError

  const { data: ws, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (error) throw error
  return { workspaceId: ws.id }
}

// ============================================================================
// app/login/actions.ts · Server Action sendMagicLink
// ============================================================================
const magicLinkSchema = z.object({ email: z.string().trim().email() })

async function sendMagicLink(formData: FormData) {
  'use server'
  const parsed = magicLinkSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'Email inválido' }

  const supabase = await createSupabaseServerClient()
  const emailRedirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`

  // Bifurcación por el claim is_anonymous del JWT actual.
  const { data } = await supabase.auth.getClaims()
  const isAnonymous = data?.claims?.is_anonymous === true

  if (isAnonymous) {
    // CRÍTICO: la conversión anónimo → permanente que PRESERVA auth.uid() es
    // updateUser({ email }) — adjunta el email a la MISMA fila de auth.users
    // y envía el link de confirmación.
    // linkIdentity NO sirve: solo acepta providers OAuth/OIDC; el tipo
    // Provider no incluye 'email' (ni 'magic_link') y la llamada no compila.
    const { error } = await supabase.auth.updateUser(
      { email: parsed.data.email },
      { emailRedirectTo },
    )
    if (error) {
      // email_exists (422): el correo pertenece a otra cuenta. En MVP no hay
      // merge: mensaje útil (solo puede dispararse para el propio intento del
      // anónimo, no es oráculo de enumeración del form público).
      if (error.code === 'email_exists') {
        return { error: 'Ese correo ya está en uso. Probá con otra dirección.' }
      }
      return { error: 'No pudimos enviar el enlace.' } // genérico, no enumera
    }
  } else {
    // Sin sesión (o permanente deslogueado): sign-in fresco. Si el email es
    // nuevo, crea un UID NUEVO. shouldCreateUser mantiene la respuesta
    // idéntica exista o no el correo (sin enumeración).
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo, shouldCreateUser: true },
    })
    if (error) return { error: 'No pudimos enviar el enlace.' }
  }

  return { success: true }
}

// ============================================================================
// app/auth/callback/route.ts
//
// NO usar exchangeCodeForSession(code): @supabase/ssr fija flowType 'pkce' y
// el exchange exige el code_verifier guardado por el cliente que INICIÓ el
// flujo. Aquí el flujo lo inicia una Server Action en el servidor → ese
// verifier no existe nunca y el exchange falla SIEMPRE. verifyOtp con
// token_hash no necesita verifier y un solo handler cubre ambos caminos.
//
// Requiere templates de email que emitan token_hash + type hacia el callback
// (las default con {{ .ConfirmationURL }} entregan un code PKCE). En local:
// config.toml → enable_confirmations = true + templates propias para
// confirmation, magic_link y email_change. OJO: un usuario NUEVO de
// signInWithOtp recibe la template de *confirmation* (type=signup), no la de
// magic_link — el callback debe aceptar también 'signup'.
// ============================================================================
import { type EmailOtpType } from '@supabase/supabase-js'

const ALLOWED_TYPES = new Set<EmailOtpType>([
  'email',
  'magiclink',
  'signup',
  'email_change', // promoción del anónimo (confirmación del updateUser)
])

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type as EmailOtpType)) {
    // Genérico: nunca filtrar el detalle del error en la URL ni en logs.
    return NextResponse.redirect(new URL('/login?error=invalid_link', request.url), 303)
  }

  const supabase = await createSupabaseServerClient()

  // Capturar el estado ANTES de verificar para detectar la promoción. El
  // post-estado sale del user que DEVUELVE verifyOtp (fresco); los claims
  // pre-verificación quedan stale hasta el refresh del token.
  const { data: before } = await supabase.auth.getClaims()
  const wasAnonymous = before?.claims?.is_anonymous === true

  const { data, error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  })
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=verification_failed', request.url), 303)
  }

  // Promoción = anónimo antes, permanente después. auth.uid() se preserva
  // solo: es la PK de la misma fila de auth.users (solo flippea is_anonymous
  // y se adjunta la identity) → toda la data workspace_id-scoped sigue
  // accesible sin migración.
  const promoted = wasAnonymous && data.user.is_anonymous === false
  if (promoted) {
    // Huella append-only SIN service_role: función SECURITY DEFINER invocada
    // con el client del propio usuario (ver migración abajo). Best-effort:
    // un fallo de auditoría no debe dejar tirado a un usuario YA promocionado
    // — se traga el error y se sigue a /app igual.
    await supabase.rpc('log_promotion')
  }

  return NextResponse.redirect(new URL('/app', request.url), 303) // siempre /app
}

// ============================================================================
// Migración · log_promotion() SECURITY DEFINER
//
// audit_log es append-only (SELECT-only por RLS, decisión de F3). En vez de
// service_role, el privilegio vive en la función:
//
//   create or replace function public.log_promotion()
//   returns void
//   language plpgsql
//   security definer
//   set search_path = ''   -- hardening: sin hijack de schema
//   as $$
//   declare v_uid uuid := auth.uid();
//           v_ws  uuid;
//   begin
//     if v_uid is null then
//       raise exception 'log_promotion: no authenticated user';
//     end if;
//     select id into v_ws from public.workspaces where owner_id = v_uid limit 1;
//     insert into public.audit_log
//       (action, actor_id, resource_type, resource_id, workspace_id, metadata)
//     values
//       ('promote_user', v_uid, 'user', v_uid, v_ws, '{}'::jsonb);
//   end; $$;
//
//   revoke execute on function public.log_promotion() from public;
//   -- GOTCHA Supabase: los default privileges conceden EXECUTE también a
//   -- anon y service_role → revocarlos EXPLÍCITAMENTE.
//   revoke execute on function public.log_promotion() from anon, service_role;
//   grant  execute on function public.log_promotion() to authenticated;
//
// Sin argumentos: el actor sale de auth.uid(), nada forjable desde el cliente.
// ============================================================================

// ============================================================================
// Server Action logout()
// scope 'global' revoca TODOS los refresh tokens del user (el default 'local'
// solo el de la sesión actual: otra pestaña/dispositivo seguiría viva). Los
// access tokens ya emitidos siguen válidos hasta su expiración.
// ============================================================================
export async function logout() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'global' })
  // redirect('/') — el proxy mintará una sesión anónima nueva si vuelve a
  // entrar en una ruta protegida.
}
