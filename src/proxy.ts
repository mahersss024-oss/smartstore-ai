import type { NextFetchEvent, NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './libs/I18nRouting';

const handleI18nRouting = createMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/admin(.*)',
  '/:locale/admin(.*)',
  '/dashboard(.*)',
  '/:locale/dashboard(.*)',
  '/onboarding(.*)',
  '/:locale/onboarding(.*)',
]);

const getPathLocalePrefix = (pathname: string) => {
  const locale = pathname.match(/^\/([a-z]{2})(?=\/|$)/)?.at(1);

  return locale && routing.locales.includes(locale as typeof routing.locales[number])
    ? `/${locale}`
    : '';
};

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (isProtectedRoute(request)) {
    return clerkMiddleware(async (auth, req) => {
      const localePrefix = getPathLocalePrefix(req.nextUrl.pathname);

      if (isProtectedRoute(req)) {
        const signInUrl = new URL(`${localePrefix}/sign-in`, req.url);

        await auth.protect({
          unauthenticatedUrl: signInUrl.toString(),
        });
      }

      const authObj = await auth();

      if (
        authObj.userId
        && !authObj.orgId
        && req.nextUrl.pathname.includes('/dashboard')
        && !req.nextUrl.pathname.endsWith('/organization-selection')
      ) {
        const orgSelection = new URL(
          `${localePrefix}/onboarding/organization-selection`,
          req.url,
        );

        return NextResponse.redirect(orgSelection);
      }

      return handleI18nRouting(req);
    })(request, event);
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: '/((?!_next|_vercel|monitoring|.*\\..*).*)',
};
