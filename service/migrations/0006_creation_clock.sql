CREATE SEQUENCE "creationClock" INCREMENT BY 1 MINVALUE -9223372036854775808 MAXVALUE 9223372036854775807 START WITH 0 CACHE 1;
--> statement-breakpoint
-- Moves the creation clock to `stamp` unless it is already there or past it. A read and a setval are two steps, so a
-- lock keyed by the sequence makes them one: held for this call only, never to the end of the caller's transaction,
-- and given back on any failure, a cancel included. setval is never undone, so a rolled-back caller leaves a gap only.
CREATE FUNCTION "advanceCreationClock"(stamp bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  clock constant regclass := '"creationClock"'::regclass;
BEGIN
  PERFORM pg_advisory_lock('pg_class'::regclass::oid::int, clock::oid::int);
  PERFORM setval(clock, stamp) FROM "creationClock" WHERE NOT is_called OR last_value < stamp;
  PERFORM pg_advisory_unlock('pg_class'::regclass::oid::int, clock::oid::int);
EXCEPTION WHEN OTHERS OR query_canceled THEN
  PERFORM pg_advisory_unlock('pg_class'::regclass::oid::int, clock::oid::int);
  RAISE;
END $$;
