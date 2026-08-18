import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isInvitePath,
  isLocalePrefix,
  localeFromAcceptLanguage,
  localePath,
  normalizeLocale,
  stripLocale,
  type SiteLocale,
} from "./lib/locale";

function pickLocale(request: NextRequest): SiteLocale {
  const fromCookie = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return localeFromAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

function withLocaleHeaders(
  request: NextRequest,
  locale: SiteLocale,
  path: string,
): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-habibi-locale", locale);
  headers.set("x-habibi-path", path);
  headers.set("x-habibi-internal", "1");
  return headers;
}

function persistLocale(response: NextResponse, locale: SiteLocale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (request.headers.get("x-habibi-internal") === "1") {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/icon")
  ) {
    return NextResponse.next();
  }

  const first = pathname.split("/").filter(Boolean)[0] ?? "";

  if (isInvitePath(pathname)) {
    const locale = pickLocale(request);
    const response = NextResponse.next({
      request: { headers: withLocaleHeaders(request, locale, pathname) },
    });
    return persistLocale(response, locale);
  }

  if (isLocalePrefix(first)) {
    const locale = first;
    const inner = stripLocale(pathname);
    if (isInvitePath(inner)) {
      const url = request.nextUrl.clone();
      url.pathname = inner;
      return NextResponse.redirect(url, 301);
    }
    const url = request.nextUrl.clone();
    url.pathname = inner;
    const response = NextResponse.rewrite(url, {
      request: { headers: withLocaleHeaders(request, locale, inner) },
    });
    return persistLocale(response, locale);
  }

  const locale = pickLocale(request);
  const target = localePath(pathname, locale);
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = search;
  return persistLocale(NextResponse.redirect(url, 301), locale);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
