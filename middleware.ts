import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/tools/chart-editor.html"];
const COOKIE_NAME = "editor_auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const authed = req.cookies.get(COOKIE_NAME)?.value === "1";
  if (authed) return NextResponse.next();

  const loginUrl = new URL("/editor-login", req.url);
  loginUrl.searchParams.set("next", "/");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/tools/chart-editor.html"],
};
