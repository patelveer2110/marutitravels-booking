import Link from "next/link";
import { eq } from "drizzle-orm";
import { CalendarRange, Download, Printer } from "lucide-react";
import { db } from "@/db";
import { bus, route, scheduleTemplate } from "@/db/schema";
import { listTripsForDate } from "@/server/services/trip";
import { OFFICE_TZ, serviceDateOf, formatTime } from "@/lib/time";
import { DeleteEmptyTripButton, EditTripButton, TripTools } from "./TripTools";
import { DatePicker } from "./DatePicker";
import { directionLabel, journeyLabel } from "@/lib/journey";

function timeInput(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export const dynamic = "force-dynamic";

export default async function TripsPage({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : serviceDateOf();

  const [trips, routes, buses, schedules] = await Promise.all([
    listTripsForDate(date),
    db.select({ id: route.id, code: route.code, origin: route.origin,
                destination: route.destination })
      .from(route).where(eq(route.isActive, true)).orderBy(route.code),
    db.select({ id: bus.id, displayName: bus.displayName,
                registrationNo: bus.registrationNo })
      .from(bus).where(eq(bus.isActive, true)).orderBy(bus.displayName),
    db.select({
      id: scheduleTemplate.id, routeId: scheduleTemplate.routeId,
      direction: scheduleTemplate.direction, departureTime: scheduleTemplate.departureTime,
      arrivalTime: scheduleTemplate.arrivalTime,
      routeCode: route.code, origin: route.origin, destination: route.destination,
    }).from(scheduleTemplate).innerJoin(route, eq(route.id, scheduleTemplate.routeId))
      .where(eq(scheduleTemplate.isActive, true)),
  ]);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Trips</h1>
          <p className="text-sm text-ink-500">
            Departures on {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>
      </header>

      <nav className="mb-4">
        <DatePicker key={date} date={date} today={serviceDateOf()}
          tools={
            <TripTools date={date}
              routes={routes.map((r) => ({
                id: r.id, label: `${r.code} · ${r.origin} → ${r.destination}`,
              }))}
              buses={buses.map((b) => ({
                id: b.id, label: `${b.displayName} (${b.registrationNo})`,
              }))}
              schedules={schedules.map((s) => ({
                id: s.id,
                label: `${s.routeCode} · ${s.origin} → ${s.destination} · ${s.direction} · ${s.departureTime}–${s.arrivalTime}`,
              }))} />
          } />
      </nav>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <CalendarRange className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="mb-1 text-sm font-medium text-ink-700">No trips on this date</p>
          <p className="text-xs text-ink-500">
            Generate them from a saved schedule, or add a single extra bus.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {trips.map((t) => {
            const sold = t.booked + t.held;
            const pct = Math.round((sold / Math.max(t.totalSeats, 1)) * 100);
            return (
              <article key={t.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">
                      {journeyLabel(t.origin, t.destination, t.direction)}
                      <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
                        {directionLabel(t.direction)}
                      </span>
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {t.busName} · {t.registrationNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink-900">
                      {formatTime(t.departureAt)}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      arr {formatTime(t.arrivalAt)}
                    </p>
                  </div>
                </div>

                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${pct}%` }} />
                </div>

                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="text-ink-600">
                    <strong className="tabular-nums text-ink-900">{t.available}</strong> free
                    <span className="mx-1.5 text-ink-300">·</span>
                    <span className="tabular-nums">{t.booked}</span> booked
                    {t.held > 0 && (
                      <>
                        <span className="mx-1.5 text-ink-300">·</span>
                        <span className="tabular-nums text-amber-700">{t.held}</span> held
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                  {t.status === "SCHEDULED" && (
                    <Link href={`/book/${t.id}`}
                      className="col-span-2 inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 sm:order-last sm:col-span-1">
                      Open seat map
                    </Link>
                  )}
                  {t.booked > 0 ? (
                    <Link href={`/trips/${t.id}/tickets`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50">
                      <Printer size={13} /> Tickets
                    </Link>
                  ) : (
                    <button type="button" disabled
                      title="Available after tickets are booked."
                      className="inline-flex min-h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-400 opacity-60">
                      <Printer size={13} /> Tickets
                    </button>
                  )}
                  {t.booked > 0 ? (
                    <Link href={`/api/trips/${t.id}/manifest`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
                      title="Generate and download the passenger manifest">
                      <Download size={13} /> Manifest
                    </Link>
                  ) : (
                    <button type="button" disabled
                      title="The manifest is available after passengers are booked."
                      aria-label="Generate manifest (available after booking)"
                      className="inline-flex min-h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-400 opacity-60">
                      <Download size={13} /> Manifest
                    </button>
                  )}
                  {t.status === "SCHEDULED" && (
                    <EditTripButton
                      routes={routes.map((r) => ({ id: r.id, label: `${r.code} · ${r.origin} → ${r.destination}` }))}
                      trip={{
                        id: t.id, routeId: t.routeId, direction: t.direction,
                        serviceDate: t.serviceDate,
                        departureTime: timeInput(t.departureAt),
                        arrivalTime: timeInput(t.arrivalAt),
                      }} />
                  )}
                  {t.templateId && t.bookingCount === 0 && t.status === "SCHEDULED" && (
                    <DeleteEmptyTripButton tripId={t.id} disabled={t.held > 0} />
                  )}
                  {t.status !== "SCHEDULED" && (
                    <span className="col-span-2 self-center text-center text-[11px] font-medium uppercase tracking-wide text-ink-500 sm:col-span-1">
                      {t.status}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
