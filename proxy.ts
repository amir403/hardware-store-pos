import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed middleware to proxy; it runs on the Node.js runtime.
// This is an *optimistic* check only (cookie presence) — the real session
// verification happens in the (dashboard) layout and in every server action.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    req.cookies.has(name)
  );

  if (pathname === "/login") {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
