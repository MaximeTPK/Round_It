import { NextResponse } from 'next/server'

export function middleware(req) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  ) return NextResponse.next()

  // Supabase peut stocker le token sous différents noms selon la version
  const cookies = req.cookies
  const hasAuth =
    cookies.get('sb-access-token') ||
    cookies.get('supabase-auth-token') ||
    cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`) ||
    [...cookies.getAll()].some(c => c.name.includes('auth-token') || c.name.includes('sb-'))

  if (hasAuth) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
