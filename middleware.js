import { NextResponse } from 'next/server'

export function middleware(req) {
  const cookie = req.cookies.get('roundit_auth')
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/') || pathname === '/login') return NextResponse.next()
  if (cookie?.value === process.env.APP_PASSWORD) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
