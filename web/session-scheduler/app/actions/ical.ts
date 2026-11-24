"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";

// Issues (or re-issues, invalidating the old URL) the current member's personal iCal feed token.
export async function issueIcalToken() {
  const session = await getSession();
  if (!session) redirect("/login");

  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.member.upsert({
    where: { id: session.id },
    create: { id: session.id, username: session.username, displayName: session.displayName, icalToken: token },
    update: { icalToken: token },
  });
  revalidatePath("/settings");
  redirect("/settings?notice=issued");
}

// Stops the feed entirely: the current URL returns 404 until a new one is issued.
export async function revokeIcalToken() {
  const session = await getSession();
  if (!session) redirect("/login");

  await prisma.member.updateMany({ where: { id: session.id }, data: { icalToken: null } });
  revalidatePath("/settings");
  redirect("/settings?notice=revoked");
}
