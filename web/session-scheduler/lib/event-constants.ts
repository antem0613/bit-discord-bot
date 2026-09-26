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

export const ROOM_LABELS: Record<SessionRoom, string> = {
  Room1: "第1会議室",
  Room2: "第2会議室",
  Room3: "第3会議室",
  Room4: "第4会議室",
  OtherServer: "他サーバー",
};
