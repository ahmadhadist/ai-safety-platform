import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check for the auth token set in cookies
  const token = request.cookies.get('auth_token')?.value
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  // If no token and not trying to login, redirect to /login
  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  // If has token and trying to access login, push them to dashboard
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  return NextResponse.next()
}

// Only run middleware on protected routes and login
export const config = {
  matcher: ['/dashboard/:path*', '/sandbox/:path*', '/permits/:path*', '/policies/:path*', '/login'],
}
