"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { booking, scheduleTemplate, seatHold, trip, tripSeatState } from "@/db/schema";
import { requireSession, requestMeta } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { adHocTripSchema, editTripSchema, generateTripsSchema, scheduleTemplateSchema } from "@/lib/schemas";
import { createTrip, generateTrips, localDateTimeToUtc } from "@/server/services/trip";
import { OFFICE_TZ } from "@/lib/time";
import { failure, zodFailure, AppError, type ActionResult } from "@/server/errors";

export async function createAdHocTripAction(raw: unknown): Promise<ActionResult<{ tripId: string }>> {
  const session = await requireSession();
  const parsed = adHocTripSchema.safeParse(raw);
  if (!parsed.success) return zodFailure(parsed.error);
  const v = parsed.data;

  try {
    const result = await db.transaction((tx) => createTrip(tx, {
      routeId: v.routeId, direction: v.direction, busId: v.busId,
      serviceDate: v.serviceDate, departureTime: v.departureTime,
      arrivalTime: v.arrivalTime, timeZone: OFFICE_TZ, agentId: session.agentId,
    }));
    revalidatePath("/trips");
    return { ok: true, data: { tripId: result.tripId } };
  } catch (e) {
    return failure(e, "createAdHocTrip");
  }
}

export async function generateTripsAction(
  raw: unknown,
): Promise<ActionResult<{ created: number; updated: number; skipped: number; errors: string[] }>> {
  const session = await requireSession();
  const parsed = generateTripsSchema.safeParse(raw);
  if (!parsed.success) return zodFailure(parsed.error);

  try {
    const result = await generateTrips({
      ...parsed.data, timeZone: OFFICE_TZ, agentId: session.agentId,
    });

    await writeAudit(db, {
      agentId: session.agentId, action: "TRIPS_GENERATED",
      entityType: "trip", entityId: null,
      after: { ...parsed.data, ...result }, ...(await requestMeta()),
    });

    revalidatePath("/trips");
    return { ok: true, data: result };
  } catch (e) {
    return failure(e, "generateTrips");
  }
}

export async function saveScheduleTemplateAction(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = scheduleTemplateSchema.safeParse(raw);
  if (!parsed.success) return zodFailure(parsed.error);
  const v = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const values = {
        routeId: v.routeId, busId: v.busId, direction: v.direction,
        departureTime: v.departureTime, arrivalTime: v.arrivalTime,
        daysOfWeek: v.daysOfWeek, isActive: v.isActive,
        validFrom: new Date(`${v.validFrom}T00:00:00Z`),
        validTo: v.validTo ? new Date(`${v.validTo}T23:59:59Z`) : null,
      };
      if (v.id) {
        await tx.update(scheduleTemplate).set(values)
          .where(eq(scheduleTemplate.id, v.id));
      } else {
        await tx.insert(scheduleTemplate).values(values);
      }
      await writeAudit(tx, {
        agentId: session.agentId,
        action: v.id ? "SCHEDULE_UPDATED" : "SCHEDULE_CREATED",
        entityType: "schedule_template", entityId: v.id ?? null, after: v,
      });
    });
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return failure(e, "saveScheduleTemplate");
  }
}

export async function cancelTripAction(
  tripId: string, reason: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!reason.trim()) return { ok: false, error: "Give a reason for cancelling." };

  try {
    await db.transaction(async (tx) => {
      const [t] = await tx.select().from(trip).where(eq(trip.id, tripId)).limit(1);
      if (!t) throw new AppError("TRIP_NOT_FOUND", "That trip no longer exists.");
      await tx.update(trip).set({ status: "CANCELLED" }).where(eq(trip.id, tripId));
      await writeAudit(tx, {
        agentId: session.agentId, action: "TRIP_CANCELLED",
        entityType: "trip", entityId: tripId,
        before: { status: t.status }, after: { reason: reason.trim() },
      });
    });
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return failure(e, "cancelTrip");
  }
}

export async function deleteEmptyGeneratedTripAction(tripId: string): Promise<ActionResult> {
  const session = await requireSession();

  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(trip)
        .where(eq(trip.id, tripId)).for("update").limit(1);
      if (!current) throw new AppError("TRIP_NOT_FOUND", "That trip no longer exists.");
      if (!current.templateId) {
        throw new AppError("TRIP_NOT_GENERATED", "Only schedule-generated trips can be deleted here.");
      }
      if (current.status !== "SCHEDULED") {
        throw new AppError("TRIP_NOT_EDITABLE", "Only scheduled trips can be deleted.");
      }

      const seatStates = await tx.select({
        status: tripSeatState.status, heldUntil: tripSeatState.heldUntil,
      }).from(tripSeatState).where(eq(tripSeatState.tripId, tripId)).for("update");
      const [existingBooking] = await tx.select({ id: booking.id })
        .from(booking).where(eq(booking.tripId, tripId)).limit(1);
      if (existingBooking) {
        throw new AppError("TRIP_NOT_EMPTY", "This trip has booking history and cannot be deleted.");
      }

      if (seatStates.some((state) => state.status === "BOOKED")) {
        throw new AppError("TRIP_NOT_EMPTY", "This trip has booked seats and cannot be deleted.");
      }
      if (seatStates.some((state) =>
        state.status === "HELD" && state.heldUntil && state.heldUntil > new Date())) {
        throw new AppError("TRIP_HAS_HOLDS", "Release or let active seat holds expire before deleting this trip.");
      }

      const [activeHold] = await tx.select({ id: seatHold.id })
        .from(seatHold).where(and(
          eq(seatHold.tripId, tripId),
          eq(seatHold.status, "ACTIVE"),
          sql`${seatHold.expiresAt} > now()`,
        )).limit(1);
      if (activeHold) {
        throw new AppError("TRIP_HAS_HOLDS", "Release or let active seat holds expire before deleting this trip.");
      }

      await tx.delete(trip).where(eq(trip.id, tripId));
      await writeAudit(tx, {
        agentId: session.agentId,
        action: "TRIP_DELETED",
        entityType: "trip",
        entityId: tripId,
        before: {
          templateId: current.templateId, serviceDate: current.serviceDate,
          departureAt: current.departureAt, arrivalAt: current.arrivalAt,
        },
        ...(await requestMeta()),
      });
    });
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return failure(e, "deleteEmptyGeneratedTrip");
  }
}

export async function editTripAction(raw: unknown): Promise<ActionResult> {
    const session = await requireSession();
    const parsed = editTripSchema.safeParse(raw);
    if (!parsed.success) return zodFailure(parsed.error);
    const v = parsed.data;

    try {
      await db.transaction(async (tx) => {
        const [current] = await tx.select().from(trip).where(eq(trip.id, v.tripId)).limit(1);
        if (!current) throw new AppError("TRIP_NOT_FOUND", "That trip no longer exists.");
        if (current.status !== "SCHEDULED") {
          throw new AppError("TRIP_NOT_EDITABLE", "Only scheduled trips can be edited.");
        }
        const [conflict] = await tx.select({ id: trip.id }).from(trip).where(and(
          ne(trip.id, v.tripId), eq(trip.busId, current.busId),
          eq(trip.serviceDate, v.serviceDate), eq(trip.direction, v.direction),
        )).limit(1);
        if (conflict) throw new AppError("TRIP_CONFLICT",
          "Another trip already uses that bus, date, and direction.");

        const departureAt = localDateTimeToUtc(v.serviceDate, v.departureTime, OFFICE_TZ);
        let arrivalAt = localDateTimeToUtc(v.serviceDate, v.arrivalTime, OFFICE_TZ);
        if (arrivalAt <= departureAt) arrivalAt = new Date(arrivalAt.getTime() + 86_400_000);
        await tx.update(trip).set({
          routeId: v.routeId, direction: v.direction, serviceDate: v.serviceDate,
          departureAt, arrivalAt,
        }).where(eq(trip.id, v.tripId));
        await writeAudit(tx, {
          agentId: session.agentId, action: "TRIP_UPDATED", entityType: "trip",
          entityId: v.tripId, before: {
            routeId: current.routeId, direction: current.direction,
            serviceDate: current.serviceDate, departureAt: current.departureAt,
            arrivalAt: current.arrivalAt,
          }, after: v, ...(await requestMeta()),
        });
      });
      revalidatePath("/trips");
      return { ok: true };
    } catch (e) {
      return failure(e, "editTrip");
  }
}
