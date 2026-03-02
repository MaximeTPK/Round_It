import { NextResponse } from 'next/server'

export function middleware(req) {
  const { pathname } = req.nextUrl

  // Laisser passer les API, login, et assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/login' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  ) return NextResponse.next()

  const cookie = req.cookies.get('roundit_auth')
  if (cookie?.value === process.env.APP_PASSWORD) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
