import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { OFFICE_TZ } from "../src/lib/time";

const LEGACY_FIX_CUTOFF = "2026-09-20 13:03:23+00";
const applyChanges = process.argv.includes("--apply");

function candidateQuery() {
  return sql`
    WITH expected AS (
      SELECT t.id, t.status, t.departure_at, t.arrival_at,
        timezone(${OFFICE_TZ},
          (t.service_date || ' ' || s.departure_time)::timestamp) AS expected_departure,
        timezone(${OFFICE_TZ},
          (t.service_date || ' ' || s.arrival_time)::timestamp) AS raw_arrival
      FROM trip t
      JOIN schedule_template s ON s.id = t.template_id
      WHERE t.created_at < ${LEGACY_FIX_CUTOFF}::timestamptz
    ),
    normalized AS (
      SELECT *,
        CASE WHEN raw_arrival <= expected_departure
          THEN raw_arrival + interval '1 day'
          ELSE raw_arrival
        END AS expected_arrival
      FROM expected
    ),
    measured AS (
      SELECT *,
        round(extract(epoch FROM (departure_at - expected_departure)) / 60)::int
          AS departure_delta,
        round(extract(epoch FROM (arrival_at - expected_arrival)) / 60)::int
          AS arrival_delta
      FROM normalized
    )
    SELECT id, status, expected_departure, expected_arrival,
      departure_delta, arrival_delta
    FROM measured
    WHERE (departure_delta = -330 AND arrival_delta = -330)
      OR (departure_delta = -331 AND arrival_delta = -332)
      OR (departure_delta = 330 AND arrival_delta = 330)
  `;
}

async function main() {
  if (OFFICE_TZ !== "Asia/Kolkata") {
    throw new Error(
      `This backfill is for the historical Asia/Kolkata bug; current timezone is ${OFFICE_TZ}.`,
    );
  }

  const candidates = await db.execute(sql`
    SELECT status, departure_delta, arrival_delta, count(*)::int AS trips
    FROM (${candidateQuery()}) AS legacy
    GROUP BY status, departure_delta, arrival_delta
    ORDER BY status, departure_delta, arrival_delta
  `);
  const candidateCount = candidates.rows.reduce(
    (total, row) => total + Number(row.trips), 0);

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    officeTimezone: OFFICE_TZ,
    createdBefore: LEGACY_FIX_CUTOFF,
    candidateCount,
    groups: candidates.rows,
    note: "Pickup/drop sequence values are already saved and unique; no stop-order rewrite is needed.",
  }, null, 2));

  if (!applyChanges || candidateCount === 0) return;

  const updated = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH expected AS (
        SELECT t.id, t.departure_at, t.arrival_at,
          timezone(${OFFICE_TZ},
            (t.service_date || ' ' || s.departure_time)::timestamp)
            AS expected_departure,
          timezone(${OFFICE_TZ},
            (t.service_date || ' ' || s.arrival_time)::timestamp) AS raw_arrival
        FROM trip t
        JOIN schedule_template s ON s.id = t.template_id
        WHERE t.created_at < ${LEGACY_FIX_CUTOFF}::timestamptz
        FOR UPDATE OF t
      ),
      normalized AS (
        SELECT *,
          CASE WHEN raw_arrival <= expected_departure
            THEN raw_arrival + interval '1 day'
            ELSE raw_arrival
          END AS expected_arrival
        FROM expected
      ),
      measured AS (
        SELECT *,
          round(extract(epoch FROM (departure_at - expected_departure)) / 60)::int
            AS departure_delta,
          round(extract(epoch FROM (arrival_at - expected_arrival)) / 60)::int
            AS arrival_delta
        FROM normalized
      ),
      legacy AS (
        SELECT id, expected_departure, expected_arrival
        FROM measured
        WHERE (departure_delta = -330 AND arrival_delta = -330)
          OR (departure_delta = -331 AND arrival_delta = -332)
          OR (departure_delta = 330 AND arrival_delta = 330)
      )
      UPDATE trip t
      SET departure_at = legacy.expected_departure,
          arrival_at = legacy.expected_arrival
      FROM legacy
      WHERE t.id = legacy.id
      RETURNING t.id
    `);
    if (result.rows.length !== candidateCount) {
      throw new Error(
        `Expected to correct ${candidateCount} trips, but updated ${result.rows.length}; transaction rolled back.`,
      );
    }
    return result.rows.length;
  });

  console.log(`Corrected ${updated} trip timestamps using ${OFFICE_TZ}.`);
}

main().catch((error: unknown) => {
  console.error("Trip timezone backfill failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => pool.end());
