import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * Optimistic check only: "does a session cookie exist?"
 * It does NOT verify the session (expired/forged cookies pass through).
 * The real check is getCurrentUser() in server code — every protected
 * page and Server Action must call it and never trust this proxy alone.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    // API clients expect a status code, not an HTML redirect to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files (anything with a file extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
