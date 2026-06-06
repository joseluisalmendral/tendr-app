// Esqueleto de referencia del flujo auth anónimo → autenticado de Tendr · F4
// El alumno NO copia este archivo literal; el agente lo genera adaptado al
// proyecto. Sirve para validar que el flujo final coincide en patrón.

// ============================================================================
// lib/supabase/server.ts
// ============================================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(toSet, _headers) {
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
// exportada pasa a llamarse proxy. El runtime es nodejs y no se configura.
// El patrón de refresco de sesión de @supabase/ssr funciona igual en proxy.
// ============================================================================
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/', '/login', '/auth/callback', '/privacy', '/terms']

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  // Permitir webhooks sin sesión
  if (request.nextUrl.pathname.startsWith('/api/webhooks/')) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, _headers) =>
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Si el user YA está autenticado y entra en /login, redirige a /app.
  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/app', request.url))
  }

  // Si NO hay user y la ruta no es pública, crear sesión anónima.
  // El usuario nunca ve /login forzado; se hace transparente.
  if (!user && !PUBLIC_ROUTES.includes(path)) {
    await supabase.auth.signInAnonymously()
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
}

// ============================================================================
// lib/auth/get-current-workspace.ts
// ============================================================================
export async function getCurrentWorkspace() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Lookup workspace; si no existe, crear con ensureAnonymousWorkspace.
  const { data: ws } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (ws) {
    return {
      user,
      workspaceId: ws.id,
      isAnonymous: user.is_anonymous ?? false,
    }
  }

  // Si llegamos aquí, el user existe pero no tiene workspace.
  // ensureAnonymousWorkspace es Server Action; debe invocarse desde el
  // componente caller. Devolver null fuerza al caller a llamarlo.
  return { user, workspaceId: null, isAnonymous: user.is_anonymous ?? false }
}

// ============================================================================
// app/(auth)/actions.ts · Server Action ensureAnonymousWorkspace
// ============================================================================
'use server'

import { z } from 'zod'

export async function ensureAnonymousWorkspace() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No session')

  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existing) return { workspaceId: existing.id }

  const { data: ws, error } = await supabase
    .from('workspaces')
    .insert({ owner_id: user.id, name: 'Mi workspace', plan: 'free' })
    .select('id')
    .single()

  if (error) throw error
  return { workspaceId: ws.id }
}

// ============================================================================
// app/(auth)/login/page.tsx · magic link form
// ============================================================================
const magicLinkSchema = z.object({ email: z.string().email() })

async function sendMagicLink(formData: FormData) {
  'use server'
  const parsed = magicLinkSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'Email inválido' }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // CRÍTICO: si el user actual es anónimo, usar linkIdentity (preserva UID).
  // Si es null, usar signInWithOtp (crea sesión nueva).
  // Provider correcto: 'email' (NO 'magic_link').
  if (user?.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'email',
      // emailRedirectTo en options según API vigente; verificar con Context7
    })
    if (error) return { error: 'No pudimos enviar el link' }
  } else {
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })
    if (error) return { error: 'No pudimos enviar el link' }
  }

  return { success: true }
}

// ============================================================================
// app/auth/callback/route.ts
// ============================================================================
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', request.url))

  const supabase = await createSupabaseServerClient()

  // Capturar user ANTES de exchange para detectar promoción.
  const { data: before } = await supabase.auth.getUser()
  const wasAnonymous = before.user?.is_anonymous ?? false
  const previousUid = before.user?.id

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))

  // Si era promoción, dejar huella en audit_log.
  const { data: after } = await supabase.auth.getUser()
  if (wasAnonymous && after.user && !after.user.is_anonymous) {
    // INSERT audit_log con action='promote_user'. Hacerlo vía Server Action
    // separada para no exponer service_role aquí.
    // logPromotion(after.user.id, previousUid)
  }

  return NextResponse.redirect(new URL('/app', request.url))
}

// ============================================================================
// Server Action logout()
// ============================================================================
export async function logout() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'global' })
}
