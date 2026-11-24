-- Optional start/end time ("HH:mm", JST) for each finalized date.
-- AlterTable
ALTER TABLE "EventFinalDate" ADD COLUMN "startTime" VARCHAR(5),
ADD COLUMN "endTime" VARCHAR(5);

-- When the host last sent a "please answer" reminder DM (cooldown).
-- AlterTable
ALTER TABLE "Event" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);
