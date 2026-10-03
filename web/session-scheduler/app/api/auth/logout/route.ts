import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/discord-auth";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  console.log("User logged out:", request.url);
  return NextResponse.redirect(new URL("/", `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/logout`));
}
