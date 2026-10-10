"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarPlus, CalendarRange, Loader2, Trash2, Wand2, X,
} from "lucide-react";
import {
  createAdHocTripAction, deleteEmptyGeneratedTripAction,
  editTripAction, generateTripsAction,
} from "./actions";
import { cn } from "@/lib/utils";

interface Option { id: string; label: string }
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface TripEditValues {
  id: string;
  routeId: string;
  direction: "ONWARD" | "RETURN";
  serviceDate: string;
  departureTime: string;
  arrivalTime: string;
}

export function EditTripDialog({ trip, routes, onClose }: {
  trip: TripEditValues; routes: Option[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [routeId, setRouteId] = useState(trip.routeId);
  const [direction, setDirection] = useState(trip.direction);
  const [serviceDate, setServiceDate] = useState(trip.serviceDate);
  const [departureTime, setDepartureTime] = useState(trip.departureTime);
  const [arrivalTime, setArrivalTime] = useState(trip.arrivalTime);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await editTripAction({
        tripId: trip.id, routeId, direction, serviceDate, departureTime, arrivalTime,
      });
      if (!res.ok) { setError(res.error ?? "Could not update the trip"); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Edit trip"
      subtitle="Update this generated trip only. Saved schedules remain unchanged."
      onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Sel label="Route" value={routeId} onChange={setRouteId} options={routes} />
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Direction" value={direction}
            onChange={(v) => setDirection(v as "ONWARD" | "RETURN")}
            options={[{ id: "ONWARD", label: "Onward" }, { id: "RETURN", label: "Return" }]} />
          <Inp label="Date" type="date" value={serviceDate} onChange={setServiceDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Departure" type="time" value={departureTime} onChange={setDepartureTime} />
          <Inp label="Arrival" type="time" value={arrivalTime} onChange={setArrivalTime} />
        </div>
        <p className="text-[11px] text-ink-500">
          Arrival earlier than departure is treated as the next morning. The assigned bus cannot be changed after generation.
        </p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <button type="button" onClick={submit} disabled={pending || !routeId}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />} Save changes
        </button>
      </div>
    </Dialog>
  );
}

export function EditTripButton({ trip, routes }: {
  trip: TripEditValues; routes: Option[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
        Edit trip
      </button>
      {open && <EditTripDialog trip={trip} routes={routes} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DeleteEmptyTripButton({
  tripId, disabled = false,
}: { tripId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function removeTrip() {
    if (disabled || pending) return;
    if (!window.confirm("Delete this empty generated trip? This cannot be undone.")) return;
    setError(null);
    start(async () => {
      const result = await deleteEmptyGeneratedTripAction(tripId);
      if (!result.ok) {
        setError(result.error ?? "Could not delete this trip.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch">
      <button type="button" onClick={removeTrip}
        disabled={disabled || pending}
        title={disabled ? "Release active seat holds before deleting this trip." : undefined}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span role="alert" className="mt-1 max-w-40 text-[10px] leading-4 text-red-700">{error}</span>}
    </div>
  );
}

export function TripTools({ routes, buses, date, schedules }: {
  routes: Option[]; buses: Option[]; date: string; schedules: Option[];
}) {
  const [open, setOpen] = useState<"adhoc" | "generate" | "advanced" | null>(null);
  const [days, setDays] = useState("30");
  const [quickScheduleIds, setQuickScheduleIds] = useState(
    () => schedules.map((schedule) => schedule.id),
  );
  const [pending, start] = useTransition();
  const [quickResult, setQuickResult] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const router = useRouter();

  function generateUpcoming() {
    const count = Number(days);
    if (!Number.isInteger(count) || count < 1 || count > 365) {
      setQuickError("Choose a whole number of days from 1 to 365.");
      return;
    }
    const end = new Date(`${date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + count - 1);
    const toDate = end.toISOString().slice(0, 10);
    setQuickError(null);
    setQuickResult(null);
    start(async () => {
      const res = await generateTripsAction({
        fromDate: date,
        toDate,
        templateIds: quickScheduleIds,
        overwriteExisting: false,
      });
      if (!res.ok || !res.data) {
        setQuickError(res.error ?? "Could not generate scheduled trips.");
        return;
      }
      const failures = res.data.errors.length > 0
        ? ` Errors: ${res.data.errors.join("; ")}`
        : "";
      setQuickResult(
        `${res.data.created} created, ${res.data.updated} updated, ${res.data.skipped} skipped.${failures}`,
      );
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generateUpcoming}
          disabled={pending || quickScheduleIds.length === 0 ||
            !Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 365}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {pending ? "Generating trips…" : `Quick generate · ${days} days`}
        </button>
        <button type="button" onClick={() => setOpen("generate")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
          Configure days & schedules
        </button>
        <button type="button" onClick={() => setOpen("adhoc")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
          <CalendarPlus size={16} /> Add extra bus
        </button>
      </div>
      {(quickError || quickResult) && (
        <p role={quickError ? "alert" : "status"}
          className={cn("mt-2 rounded-lg px-3 py-2 text-xs",
            quickError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
          {quickError ?? quickResult}
        </p>
      )}
      {open === "adhoc" && (
        <AdHocDialog routes={routes} buses={buses} date={date}
          onClose={() => setOpen(null)} />
      )}
      {open === "generate" && (
        <QuickGenerateDialog
          date={date}
          days={days}
          onDaysChange={setDays}
          schedules={schedules}
          selectedSchedules={quickScheduleIds}
          onSelectedSchedulesChange={setQuickScheduleIds}
          pending={pending}
          error={quickError}
          result={quickResult}
          onGenerate={generateUpcoming}
          onAdvanced={() => setOpen("advanced")}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "advanced" && (
        <GenerateDialog date={date} schedules={schedules}
          selectedScheduleIds={quickScheduleIds} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function QuickGenerateDialog({
  date, days, onDaysChange, schedules, selectedSchedules,
  onSelectedSchedulesChange, pending, error, result, onGenerate, onAdvanced, onClose,
}: {
  date: string;
  days: string;
  onDaysChange: (value: string) => void;
  schedules: Option[];
  selectedSchedules: string[];
  onSelectedSchedulesChange: (update: (current: string[]) => string[]) => void;
  pending: boolean;
  error: string | null;
  result: string | null;
  onGenerate: () => void;
  onAdvanced: () => void;
  onClose: () => void;
}) {
  const validDays = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365;

  return (
    <Dialog title="Configure quick generation"
      subtitle="Set the default day count and choose which active saved schedules the quick action uses."
      onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <label className="text-xs font-semibold text-ink-700" htmlFor="trip-generation-days">
            Generate for
            <span className="mt-1 flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <input id="trip-generation-days" type="text" inputMode="numeric"
                pattern="[0-9]*" maxLength={3} value={days}
                onChange={(e) => onDaysChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
                onBlur={() => {
                  const count = Number(days);
                  if (days && count > 365) onDaysChange("365");
                }}
                aria-describedby="trip-generation-days-hint"
                className="h-full min-w-0 flex-1 rounded-l-lg bg-transparent px-3 text-sm font-semibold tabular-nums text-ink-900 outline-none" />
              <span className="px-3 text-sm font-normal text-ink-500">days</span>
            </span>
            <span id="trip-generation-days-hint" className="mt-1 block font-normal text-ink-500">
              Enter 1–365 days
            </span>
          </label>
          <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
            Trips start on{" "}
            <strong className="font-semibold text-ink-800">
              {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
                day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
              })}
            </strong>. Existing trips will not be overwritten.
          </div>
        </div>

        <fieldset className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-semibold text-ink-700">
              Schedules ({selectedSchedules.length} of {schedules.length} selected)
            </legend>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => onSelectedSchedulesChange(() => schedules.map((schedule) => schedule.id))}
                className="text-xs font-medium text-brand-700 hover:underline">
                Select all
              </button>
              <button type="button" onClick={() => onSelectedSchedulesChange(() => [])}
                className="text-xs font-medium text-ink-500 hover:text-ink-800">
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {schedules.map((schedule) => (
              <label key={schedule.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs text-ink-700 transition hover:bg-ink-50">
                <input type="checkbox" checked={selectedSchedules.includes(schedule.id)}
                  onChange={(e) => onSelectedSchedulesChange((current) =>
                    e.target.checked
                      ? [...current, schedule.id]
                      : current.filter((id) => id !== schedule.id))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
                <span className="leading-5">{schedule.label}</span>
              </label>
            ))}
            {schedules.length === 0 && (
              <p className="rounded-lg px-3 py-4 text-center text-xs text-ink-500">
                No active schedules. Add or activate a schedule first.
              </p>
            )}
          </div>
        </fieldset>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {result && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{result}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" onClick={onAdvanced}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50">
            <CalendarRange size={15} /> Choose specific dates and weekdays
          </button>
          <button type="button" onClick={onGenerate}
            disabled={pending || selectedSchedules.length === 0 || !validDays}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {pending ? "Generating…" : `Generate ${days} days`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({ title, subtitle, onClose, children, wide = false }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/30 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl",
        wide ? "max-w-2xl" : "max-w-md")}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AdHocDialog({ routes, buses, date, onClose }: {
  routes: Option[]; buses: Option[]; date: string; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [busId, setBusId] = useState(buses[0]?.id ?? "");
  const [direction, setDirection] = useState<"ONWARD" | "RETURN">("ONWARD");
  const [serviceDate, setServiceDate] = useState(date);
  const [departureTime, setDepartureTime] = useState("21:00");
  const [arrivalTime, setArrivalTime] = useState("07:00");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await createAdHocTripAction({
        routeId, busId, direction, serviceDate, departureTime, arrivalTime,
      });
      if (!res.ok) { setError(res.error ?? "Could not create the trip"); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Add an extra bus"
      subtitle="For a day that needs a second or third departure."
      onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Sel label="Route" value={routeId} onChange={setRouteId} options={routes} />
        <Sel label="Bus" value={busId} onChange={setBusId} options={buses} />
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Direction" value={direction}
            onChange={(v) => setDirection(v as "ONWARD" | "RETURN")}
            options={[{ id: "ONWARD", label: "Onward" }, { id: "RETURN", label: "Return" }]} />
          <Inp label="Date" type="date" value={serviceDate} onChange={setServiceDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Departure" type="time" value={departureTime} onChange={setDepartureTime} />
          <Inp label="Arrival" type="time" value={arrivalTime} onChange={setArrivalTime} />
        </div>
        <p className="text-[11px] text-ink-500">
          An arrival earlier than the departure is treated as the next morning.
        </p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <button type="button" onClick={submit} disabled={pending || !routeId || !busId}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />} Create trip
        </button>
      </div>
    </Dialog>
  );
}

function GenerateDialog({ date, schedules, selectedScheduleIds, onClose }: {
  date: string; schedules: Option[]; selectedScheduleIds: string[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fromDate, setFromDate] = useState(date);
  const [toDate, setToDate] = useState(() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>(selectedScheduleIds);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number; updated: number; skipped: number; errors: string[];
  } | null>(null);

  function submit() {
    setError(null); setResult(null);
    start(async () => {
      const res = await generateTripsAction({
        fromDate, toDate, templateIds: selectedSchedules,
        daysOfWeek, overwriteExisting,
      });
      if (!res.ok) { setError(res.error ?? "Could not generate"); return; }
      setResult(res.data!);
      router.refresh();
    });
  }

  return (
    <Dialog title="Generate trips"
      subtitle="Choose schedules and dates. Existing generated trips can be updated when they have no bookings or holds."
      onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Inp label="From" type="date" value={fromDate} onChange={setFromDate} />
          <Inp label="To" type="date" value={toDate} onChange={setToDate} />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-700">Schedules to generate</p>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {schedules.length === 0 && <p className="text-xs text-ink-500">No active schedules found.</p>}
            {schedules.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-xs text-ink-700">
                <input type="checkbox" checked={selectedSchedules.includes(s.id)}
                  onChange={(e) => setSelectedSchedules((current) =>
                    e.target.checked ? [...current, s.id] : current.filter((id) => id !== s.id))} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-700">
            Generate on these days
          </legend>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAYS.map((day, index) => (
              <label key={day}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-ink-700">
                <input type="checkbox" checked={daysOfWeek.includes(index)}
                  onChange={(e) => setDaysOfWeek((current) =>
                    e.target.checked
                      ? [...current, index].sort((a, b) => a - b)
                      : current.filter((value) => value !== index))} />
                {day}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            This filters scheduled days and cannot enable weekdays disabled in a schedule.
          </p>
        </fieldset>
        <label className="flex items-start gap-2 text-xs text-ink-700">
          <input type="checkbox" checked={overwriteExisting}
            onChange={(e) => setOverwriteExisting(e.target.checked)} />
          <span><strong>Update existing trips</strong><br /><span className="text-ink-500">Only trips without bookings or holds are changed.</span></span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {result && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <p><strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated, <strong>{result.skipped}</strong> skipped.</p>
            {result.errors.length > 0 && (
              <ul className="mt-1 text-red-700">
                {result.errors.slice(0, 4).map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            )}
          </div>
        )}
        <button type="button" onClick={submit}
          disabled={pending || selectedSchedules.length === 0 || daysOfWeek.length === 0}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />} Generate
        </button>
        <a href="/masters/schedules"
          className="text-center text-xs text-brand-600 hover:underline">
          Manage schedules
        </a>
      </div>
    </Dialog>
  );
}

const field = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "bg-white")}>
        {options.length === 0 && <option value="">None available</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Inp({ label, type, value, onChange }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </div>
  );
}
