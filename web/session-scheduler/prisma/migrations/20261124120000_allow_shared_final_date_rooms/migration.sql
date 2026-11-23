-- Cancelled events no longer occupy a room, and "OtherServer" may be used by several events on the
-- same day, so (date, room) uniqueness moves to the app (findRoomConflicts + advisory lock).
-- DropIndex
DROP INDEX "EventFinalDate_date_room_key";

-- CreateIndex
CREATE INDEX "EventFinalDate_date_room_idx" ON "EventFinalDate"("date", "room");
