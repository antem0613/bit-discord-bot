@AGENTS.md

## Testing the app as a logged-in user (mock auth)

Every page requires a Discord login (see `proxy.ts`). For local testing (Playwright etc.) use the
dev-only mock login instead of Discord OAuth:

- Enabled only when `MOCK_AUTH=1` is set **and** `NODE_ENV !== "production"` (`lib/mock-auth.ts`).
  Otherwise `/api/auth/mock` returns 404 and any mock session is rejected by the proxy.
- Log in by navigating to `GET /api/auth/mock?user=<key>&name=<display name>&next=<path>`
  (`user` matches `[a-z0-9_-]{1,32}`, defaults to `tester`). It upserts a `Member` row with id
  `mock-<key>`, sets the session cookie, and redirects to `next`.
- Use separate keys for separate roles, e.g. `user=alice` (event creator) and `user=bob`
  (respondent), in separate browser contexts.
- Mock users never receive Discord DMs (`lib/notifications.ts` skips `mock-` ids).
- Clean up afterwards with `DELETE /api/auth/mock`: deletes events created by `mock-*` members and
  the `mock-*` members themselves (their answers/participations cascade).
- Never select real members as participants while testing: they get Discord DMs. With mock auth on,
  existing `mock-*` members are listed in the participant picker (username `@mock-…`); log them in
  once via `/api/auth/mock?user=…` first, then select only labels containing `@mock-`.
- After changing `prisma/schema.prisma` (+ `prisma migrate deploy` / `prisma generate`), the running
  `next dev` must be restarted: it keeps the old Prisma client and queries on new columns fail.
