-- CreateEnum
CREATE TYPE "SchedulingStatus" AS ENUM ('SCHEDULING', 'FINALIZED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SessionRoom" AS ENUM ('Room1', 'Room2', 'Room3', 'Room4', 'OtherServer');

-- CreateEnum
CREATE TYPE "AvailabilitySymbol" AS ENUM ('CIRCLE', 'TRIANGLE', 'CROSS', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SchedulingStatus" NOT NULL DEFAULT 'SCHEDULING',
    "creatorId" TEXT NOT NULL,
    "schedulingDeadline" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCandidateDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "EventCandidateDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSymbolLabel" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "symbol" "AvailabilitySymbol" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "EventSymbolLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleResponse" (
    "id" TEXT NOT NULL,
    "candidateDateId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "symbol" "AvailabilitySymbol" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFinalDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "room" "SessionRoom",

    CONSTRAINT "EventFinalDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventCandidateDate_eventId_date_key" ON "EventCandidateDate"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EventSymbolLabel_eventId_symbol_key" ON "EventSymbolLabel"("eventId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResponse_candidateDateId_memberId_key" ON "ScheduleResponse"("candidateDateId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFinalDate_eventId_date_key" ON "EventFinalDate"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EventFinalDate_date_room_key" ON "EventFinalDate"("date", "room");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCandidateDate" ADD CONSTRAINT "EventCandidateDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSymbolLabel" ADD CONSTRAINT "EventSymbolLabel_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResponse" ADD CONSTRAINT "ScheduleResponse_candidateDateId_fkey" FOREIGN KEY ("candidateDateId") REFERENCES "EventCandidateDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResponse" ADD CONSTRAINT "ScheduleResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResponse" ADD CONSTRAINT "ScheduleResponse_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFinalDate" ADD CONSTRAINT "EventFinalDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
