import { NextResponse } from 'next/server'

// Middleware for Next.js 14+
export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // Router prefetches are skipped here rather than in `config.matcher`.
  // The matcher used to express this with the object form
  // ({ source, missing: [...] }), which `next build` accepts but Vercel's
  // middleware compiler rejects outright:
  //   "Middleware's `config.matcher` must be a path matcher (string) or an
  //    array of path matchers (string[])"
  // Same behaviour, expressed where it is portable.
  if (
    request.headers.get('next-router-prefetch') !== null
    || request.headers.get('purpose') === 'prefetch'
  ) {
    return NextResponse.next();
  }

  // Case normalization: Redirect to lowercase path if it contains uppercase characters
  if (pathname !== pathname.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 301);
  }

  // Security: Check for potential middleware subrequest bypass, 
  // but don't block it blindly as Vercel uses this header internally
  // for certain routing and preview features.
  
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Security headers
  if (!request.nextUrl.pathname.startsWith('/widget')) {
    response.headers.set('X-Frame-Options', 'DENY')
  }
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )

  // Simplified CSP for DEX - Allow all RPC endpoints
  const csp = [
    // Base directives
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com https://static.tradingview.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    
    // Allow all RPC endpoints for blockchain interactions
    "connect-src 'self' https://li.quest https://api.lifi.io https: wss:",
    
    // Frame and other directives
    "frame-src 'self' https:",
    "child-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    request.nextUrl.pathname.startsWith('/widget') ? "frame-ancestors *" : "frame-ancestors 'none'",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  
  // Additional security headers
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  
  return response
}

// In Next.js 16+, the matcher configuration is done differently
// You can either:
// 1. Use the export config (still supported in some cases)
// 2. Or conditionally apply in the proxy function

export const config = {
  // Must be a string or string[] - see the prefetch note in middleware() above.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)'],
}