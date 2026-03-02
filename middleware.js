import { NextResponse } from 'next/server'

export function middleware(req) {
  const { pathname } = req.nextUrl

  // Laisser passer les API, login, register et assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  ) return NextResponse.next()

  // Vérifier le token Supabase dans les cookies
  const token = req.cookies.get('sb-access-token') || req.cookies.get('supabase-auth-token')
  if (token) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
