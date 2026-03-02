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

  const token = req.cookies.get('sb-yqjenhpaohwunjvgmlyw-auth-token')
  if (token) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
