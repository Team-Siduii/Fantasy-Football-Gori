import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionEmail } from "@/lib/auth-session-codec";

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password";
}

function isPublicPage(pathname: string) {
  return pathname === "/" || isAuthPage(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = parseSessionEmail(request.cookies.get(AUTH_COOKIE_NAME)?.value) !== null;

  if (!isPublicPage(pathname) && !isAuthenticated) {
    const homeUrl = new URL("/", request.url);
    homeUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(homeUrl);
  }

  if (isAuthPage(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/manager/my-team", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
