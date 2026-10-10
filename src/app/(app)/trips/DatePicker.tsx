"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Date navigation for the trip list.
 *
 * The arrows are for nudging a day either way; the month grid and date field
 * make farther-out bookings a single selection instead of repeated day steps.
 */
export function DatePicker({
  date, today, tools,
}: { date: string; today: string; tools?: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(`${date.slice(0, 7)}-01T00:00:00Z`));

  const go = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    setVisibleMonth(new Date(`${next.slice(0, 7)}-01T00:00:00Z`));
    start(() => router.push(`/trips?date=${next}`));
  };
  const firstCell = new Date(visibleMonth);
  firstCell.setUTCDate(firstCell.getUTCDate() - firstCell.getUTCDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setUTCDate(firstCell.getUTCDate() + index);
    return toIsoDate(day);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go(shift(date, -1))} disabled={pending}
          aria-label="Previous day"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
            <ChevronLeft size={15} />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <label className="relative inline-flex items-center">
            <CalendarDays size={15}
              className="pointer-events-none absolute left-2.5 text-ink-400" />
            <span className="sr-only">Travel date</span>
            <input type="date" value={date} disabled={pending}
              onChange={(e) => go(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-2.5 text-sm font-medium text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-50" />
          </label>

          <button type="button" onClick={() => go(shift(date, 1))} disabled={pending}
          aria-label="Next day"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={15} />
          </button>

          {date !== today && (
            <button type="button" onClick={() => go(today)} disabled={pending}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
              Today
            </button>
          )}

          {pending && <Loader2 size={15} className="animate-spin text-ink-400" />}
        </div>
        {tools}
      </div>

      <section aria-label="Choose a travel date"
        className="max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
        <header className="mb-3 flex items-center justify-between">
          <button type="button" aria-label="Previous month" disabled={pending}
            onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))}
            className="rounded-lg border border-[var(--border)] p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-50">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-ink-800">
            {visibleMonth.toLocaleDateString("en-IN", {
              month: "long", year: "numeric", timeZone: "UTC",
            })}
          </h2>
          <button type="button" aria-label="Next month" disabled={pending}
            onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}
            className="rounded-lg border border-[var(--border)] p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-50">
            <ChevronRight size={16} />
          </button>
        </header>
        <div className="grid grid-cols-7 gap-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <div key={day}
              className="py-1 text-center text-[10px] font-semibold uppercase text-ink-400">
              {day}
            </div>
          ))}
          {calendarDays.map((day) => {
            const isCurrentMonth = day.slice(0, 7) === toIsoDate(visibleMonth).slice(0, 7);
            return (
              <button key={day} type="button"
                aria-label={new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                  timeZone: "UTC",
                })}
                aria-current={day === today ? "date" : undefined}
                aria-pressed={day === date}
                disabled={pending}
                onClick={() => go(day)}
                className={cn(
                  "min-h-9 rounded-lg text-xs transition hover:bg-brand-50",
                  !isCurrentMonth && "text-ink-300",
                  day === date && "bg-brand-600 font-semibold text-white hover:bg-brand-700",
                  day === today && day !== date && "border border-brand-300 font-semibold text-brand-700",
                  pending && "opacity-50",
                )}>
                {Number(day.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
