// Plain enum-derived constants with no Prisma Client runtime dependency, safe for Client Components.
import { AvailabilitySymbol, SessionRoom } from "@/app/generated/prisma/enums";

export const SYMBOL_ORDER: AvailabilitySymbol[] = [
  AvailabilitySymbol.CIRCLE,
  AvailabilitySymbol.TRIANGLE,
  AvailabilitySymbol.CROSS,
  AvailabilitySymbol.UNKNOWN,
];

export const DEFAULT_SYMBOL_LABELS: Record<AvailabilitySymbol, string> = {
  CIRCLE: "参加できる",
  TRIANGLE: "調整すれば参加できる",
  CROSS: "参加できない",
  UNKNOWN: "わからない",
};

export const SYMBOL_MARKS: Record<AvailabilitySymbol, string> = {
  CIRCLE: "〇",
  TRIANGLE: "△",
  CROSS: "×",
  UNKNOWN: "？",
};

// Used to score each candidate date so the best-attended day can be highlighted.
export const SYMBOL_SCORES: Record<AvailabilitySymbol, number> = {
  CIRCLE: 1,
  TRIANGLE: 0.5,
  CROSS: -1,
  UNKNOWN: 0,
};

export const ROOM_LABELS: Record<SessionRoom, string> = {
  Room1: "セッション部屋１",
  Room2: "セッション部屋２",
  Room3: "セッション部屋３",
  Room4: "セッション部屋４",
  OtherServer: "他サーバー",
};
