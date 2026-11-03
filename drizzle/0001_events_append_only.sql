-- Money rule 7: events are append-only. The DB refuses UPDATE/DELETE so no code path (or bug) can rewrite history.
-- The receipt tamper demo (src/lib/admin/, judge mode only) is the one sanctioned bypass.
CREATE TRIGGER `events_no_update` BEFORE UPDATE ON `events`
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `events_no_delete` BEFORE DELETE ON `events`
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
