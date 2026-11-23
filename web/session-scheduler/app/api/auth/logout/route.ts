import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/discord-auth";
import { getSiteBaseUrl } from "@/lib/site-url";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  // 303 so the browser follows the redirect with GET rather than re-POSTing to "/".
  return NextResponse.redirect(new URL("/login", getSiteBaseUrl(request)), 303);
}
