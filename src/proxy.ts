// Middleware de Next.js — protege rutas y refresca sesión de Supabase
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que NO requieren autenticación de ferretería
const RUTAS_PUBLICAS = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/update-password',
  '/api/webhook', // El webhook de YCloud es público (verificado con HMAC)
  '/api/delivery',          // API del repartidor — autenticación por token en URL
  '/api/mercadopago/callback', // Callback OAuth de MP — redirige al usuario tras autorizar
  '/invite',      // Página de aceptar invitación de equipo (token público)
  '/delivery',    // Interfaz del repartidor en su celular (token público)
  '/tracking',    // Página de tracking pública para el cliente (sin login)
  '/api/tracking',// API de tracking — datos de posición GPS (sin auth)
  // Panel de superadmin — tiene su propio sistema de autenticación
  // (Supabase Auth + tabla superadmins + header x-superadmin-secret)
  '/superadmin',
  '/api/superadmin',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refrescar sesión (importante: no agregar lógica entre createServerClient y getUser)
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Verificar si la ruta es pública
  const esRutaPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta))

  // Usuario no autenticado intentando acceder a ruta protegida → login
  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Usuario autenticado en raíz → dashboard
  if (user && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Usuario autenticado intenta acceder a auth → dashboard
  if (user && pathname.startsWith('/auth') && !pathname.startsWith('/auth/update-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Excluir archivos estáticos y rutas internas de Next.js
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
