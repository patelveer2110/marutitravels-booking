"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, Loader2, Lock, PauseCircle, Printer, RefreshCw,
  Ticket, X,
} from "lucide-react";
import { SeatMap, type SeatVisualState } from "@/components/seat-map/SeatMap";
import type { SeatLike } from "@/components/seat-map/geometry";
import { formatINR } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HoldTimer } from "./HoldTimer";
import { SeatNumberInput } from "./SeatNumberInput";
import {
  fetchSeatsAction, holdSeatsAction, releaseHoldAction, extendHoldAction,
  confirmBookingAction, parkHoldAction, updateHoldSeatsAction,
} from "./actions";
import type { SeatStateRow } from "@/server/services/seat-hold";
import { directionLabel, journeyLabel, pointKindsFor } from "@/lib/journey";
import {
  toggleSeat as toggleSeatRule, addSeats as addSeatsRule, removeSeat,
  type SplitPrompt,
} from "@/lib/seat-selection";

const POLL_MS = 3000;

export interface TripHeader {
  id: string;
  origin: string;
  destination: string;
  direction: "ONWARD" | "RETURN";
  serviceDate: string;
  departureAt: string;
  arrivalAt: string;
  busName: string;
  registrationNo: string;
  sleeperRows: number;
  sleeperCols: number;
  cabinCols: number;
  fareSingleSofaPaise: number;
  fareDoubleSofaPaise: number;
  fareCabinPaise: number;
  extraPersonSinglePaise: number;
  extraPersonDoublePaise: number;
}

export interface PointOption { id: string; name: string; kind: "BOARDING" | "DROPPING" }

export interface ResumableHold {
  holdId: string;
  expiresAt: string;
  serverNow: string;
  seatIds: string[];
  provisionalName: string | null;
  provisionalPhone: string | null;
}

interface Props {
  trip: TripHeader;
  initialSeats: SeatStateRow[];
  points: PointOption[];
  agentId: string;
  /** a still-live reservation being picked back up, from ?hold= */
  resume?: ResumableHold | null;
}

type Phase = "SELECTING" | "HELD" | "DONE";
type MobileBookingStep = "SEATS" | "DETAILS";

export function BookingScreen({
  trip, initialSeats, points, agentId, resume,
}: Props) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatStateRow[]>(initialSeats);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(resume?.seatIds ?? []));
  const [heldSeatIds, setHeldSeatIds] = useState<Set<string>>(
    () => new Set(resume?.seatIds ?? []));
  const [phase, setPhase] = useState<Phase>(resume ? "HELD" : "SELECTING");
  const [mobileStep, setMobileStep] = useState<MobileBookingStep>(
    resume ? "DETAILS" : "SEATS");
  const [hold, setHold] = useState<{ holdId: string; expiresAt: string; serverNow: string } | null>(
    resume
      ? { holdId: resume.holdId, expiresAt: resume.expiresAt, serverNow: resume.serverNow }
      : null);
  const [holdName, setHoldName] = useState("");
  const [holdPhone, setHoldPhone] = useState("");
  /** the name typed when the seats were parked, pre-filled on return */
  const customerHint = {
    name: resume?.provisionalName ?? holdName,
    phone: resume?.provisionalPhone ?? holdPhone,
  };
  const [conflict, setConflict] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number;
    seatChargePaise: number;
    singleExtraPersonCount: number; singleExtraPersonChargePaise: number;
    doubleExtraPersonCount: number; doubleExtraPersonChargePaise: number;
  } | null>(null);
  const [splitPrompt, setSplitPrompt] = useState<SplitPrompt | null>(null);

  const seatById = new Map(seats.map((s) => [s.seatId, s]));

  const defaultFareFor = useCallback((s: SeatStateRow) =>
    s.berthType === "CABIN" ? trip.fareCabinPaise
      : s.berthType === "SLEEPER_SINGLE" ? trip.fareSingleSofaPaise
      : trip.fareDoubleSofaPaise, [trip]);

  /**
   * Ingest a fresh seat snapshot.
   *
   * Selection pruning happens here rather than in a separate effect watching
   * `seats`: a seat another agent just took must stop being selected, and doing
   * that where the data actually arrives avoids a second render pass.
   */
  const applySnapshot = useCallback((next: SeatStateRow[]) => {
    setSeats(next);
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(next.map((s) => [s.seatId, s]));
      const kept = new Set<string>();
      for (const id of prev) {
        const s = byId.get(id);
        if (!s) continue;
        // seats under our own live hold stay selected; only free seats can be
        // pruned, and only while still choosing
        const ours = s.status === "HELD" && s.heldByAgentId === agentId;
        if (ours || (s.status === "AVAILABLE" && s.isActive)) kept.add(id);
      }
      return kept.size === prev.size ? prev : kept;
    });
  }, [agentId]);

  const refresh = useCallback(async () => {
    try {
      const snap = await fetchSeatsAction(trip.id);
      applySnapshot(snap.seats);
    } catch { /* a dropped poll is harmless; the next one recovers */ }
  }, [trip.id, applySnapshot]);

  /* live seat map — polling, because correctness never depends on push */
  useEffect(() => {
    if (phase === "DONE") return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, phase]);

  function stateOf(s: SeatLike): SeatVisualState {
    const row = seatById.get((s as unknown as SeatStateRow).seatId);
    if (!row) return "AVAILABLE";
    if (!row.isActive) return "BLOCKED";
    if (conflict.includes(row.seatNumber)) return "BLOCKED";
    if (row.status === "BOOKED") {
      if (row.gender === "M") return "BOOKED_M";
      if (row.gender === "F") return "BOOKED_F";
      if (row.gender === "O") return "BOOKED_O";
      return "BOOKED";
    }
    if (row.status === "BLOCKED") return "BLOCKED";
    if (row.status === "HELD") {
      if (hold && row.holdId === hold.holdId) {
        return selected.has(row.seatId) ? "SELECTED" : "HELD_BY_ME";
      }
      return row.heldByAgentId === agentId ? "HELD_BY_ME" : "HELD_BY_OTHER";
    }
    return selected.has(row.seatId) ? "SELECTED" : "AVAILABLE";
  }

  function titleOf(s: SeatLike): string {
    const row = seatById.get((s as unknown as SeatStateRow).seatId);
    if (!row) return s.seatNumber;
    const price = formatINR(defaultFareFor(row));
    if (row.status === "BOOKED") return `${row.seatNumber} · booked · click to view booking`;
    if (row.status === "HELD" && row.heldByAgentName) {
      return `${row.seatNumber} · held by ${row.heldByAgentName}`;
    }
    if (!row.isActive) return `${row.seatNumber} · not in service`;
    return `${row.seatNumber} · ${price}`;
  }

  const selectableSeats = seats.map((row) =>
    hold && row.holdId === hold.holdId ? { ...row, status: "AVAILABLE" as const } : row);

  function toggleSeat(seatId: string) {
    if (phase === "DONE") return;
    setConflict([]);
    const outcome = toggleSeatRule(selectableSeats, selected, seatId);
    if (outcome.confirmSplit) { setSplitPrompt(outcome.confirmSplit); return; }
    setSelected(outcome.selected);
  }

  function addSeatsByNumber(ids: string[]) {
    setConflict([]);
    setSelected((prev) => addSeatsRule(selectableSeats, prev, ids));
  }

  function confirmSplit() {
    if (!splitPrompt) return;
    setSelected((prev) => removeSeat(prev, splitPrompt.seatId));
    setSplitPrompt(null);
  }

  function doHold() {
    setError(null); setConflict([]);
    if (holdPhone && !/^[6-9]\d{9}$/.test(holdPhone)) {
      setError("Reservation phone number must be a valid 10-digit mobile number.");
      return;
    }
    start(async () => {
      const res = await holdSeatsAction({
        tripId: trip.id, seatIds: [...selected],
        provisionalName: holdName, provisionalPhone: holdPhone,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not reserve those seats.");
        setConflict(res.conflictingSeats ?? []);
        await refresh();
        return;
      }
      setHold({ holdId: res.data.holdId, expiresAt: res.data.expiresAt,
                serverNow: res.data.serverNow });
      setHeldSeatIds(new Set(selected));
      setPhase("HELD");
      setMobileStep("DETAILS");
      await refresh();
    });
  }

  function updateHeldSeats() {
    if (!hold) return;
    setError(null); setConflict([]);
    start(async () => {
      const res = await updateHoldSeatsAction(hold.holdId, [...selected]);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not update the reserved seats.");
        setConflict(res.conflictingSeats ?? []);
        await refresh();
        return;
      }
      setHeldSeatIds(new Set(res.data.seatIds));
      await refresh();
      setMobileStep("DETAILS");
    });
  }

  function doRelease() {
    if (!hold) return;
    start(async () => {
      await releaseHoldAction(hold.holdId);
      setHold(null); setHeldSeatIds(new Set()); setPhase("SELECTING");
      setSelected(new Set()); setError(null);
      await refresh();
    });
  }

  function doExtend() {
    if (!hold) return;
    start(async () => {
      const res = await extendHoldAction(hold.holdId);
      if (!res.ok || !res.data) { setError(res.error ?? "Could not extend."); return; }
      setHold({ holdId: hold.holdId, expiresAt: res.data.expiresAt,
                serverNow: res.data.serverNow });
    });
  }

  const selectedRows = [...selected]
    .map((id) => seatById.get(id))
    .filter((s): s is SeatStateRow => !!s);

  if (phase === "DONE" && result) {
    return (
      <BookingDone result={result} onNew={() => {
        setResult(null); setHold(null); setSelected(new Set());
        setHeldSeatIds(new Set());
        setPhase("SELECTING"); router.refresh();
      }} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TripBar trip={trip} />

      <nav className="grid grid-cols-2 gap-2 sm:hidden" aria-label="Booking steps">
        <button type="button" onClick={() => setMobileStep("SEATS")}
          aria-current={mobileStep === "SEATS" ? "step" : undefined}
          className={cn("rounded-lg border px-3 py-2 text-xs font-semibold",
            mobileStep === "SEATS" ? "border-brand-300 bg-brand-50 text-brand-800" : "border-[var(--border)] text-ink-500")}>
          1 · Choose seats
        </button>
        <button type="button" onClick={() => setMobileStep("DETAILS")}
          disabled={phase !== "HELD"}
          aria-current={mobileStep === "DETAILS" ? "step" : undefined}
          className={cn("rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40",
            mobileStep === "DETAILS" ? "border-brand-300 bg-brand-50 text-brand-800" : "border-[var(--border)] text-ink-500")}>
          2 · Passenger details
        </button>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className={cn("min-w-0 flex-col gap-4",
        mobileStep === "SEATS" ? "flex" : "hidden", "sm:flex")}>
        {error && (
          <div role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{error}</p>
              {conflict.length > 0 && (
                <p className="mt-1 text-xs">
                  The map has been refreshed — {conflict.join(", ")} shown in red
                  {conflict.length === 1 ? " is" : " are"} no longer free.
                </p>
              )}
            </div>
          </div>
        )}

        <SeatMap
          seats={seats as unknown as SeatLike[]}
          sleeperRows={trip.sleeperRows}
          sleeperCols={trip.sleeperCols}
          cabinCols={trip.cabinCols}
          stateOf={stateOf}
          titleOf={titleOf}
          onSeatClick={phase !== "DONE"
            ? (s) => {
                const row = s as unknown as SeatStateRow;
                if (row.status === "BOOKED" && row.bookingId) {
                  router.push(`/tickets/${row.bookingId}`);
                  return;
                }
                toggleSeat(row.seatId);
              }
            : undefined}
          disabledSeat={(s) => {
            const row = seatById.get((s as unknown as SeatStateRow).seatId);
            return phase === "DONE" || !row ||
              !(row.status === "AVAILABLE" || row.status === "BOOKED" ||
                (hold && row.holdId === hold.holdId)) ||
              !row.isActive;
          }}
        />
      </div>

      <aside className={cn("order-last flex flex-col gap-4 xl:order-none",
        phase === "SELECTING" || mobileStep === "DETAILS" ? "flex" : "hidden", "sm:flex")}>
        {phase === "SELECTING" && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-800">Choose seats</h2>
            <SeatNumberInput tripId={trip.id} onResolved={addSeatsByNumber} />

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <SelectedList rows={selectedRows} fareOf={defaultFareFor}
                onRemove={toggleSeat} />
            </div>

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="mb-1.5 text-[11px] font-medium text-ink-600">
                Who is it for? <span className="font-normal text-ink-400">optional</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input id="hold-name" value={holdName} maxLength={120}
                  onChange={(e) => setHoldName(e.target.value)}
                  aria-label="Customer name for this reservation"
                  placeholder="Name"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                <input id="hold-phone" value={holdPhone} type="tel" inputMode="numeric"
                  autoComplete="tel-national" maxLength={10} pattern="[6-9][0-9]{9}"
                  onChange={(e) => setHoldPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  aria-label="Customer 10-digit mobile number for this reservation"
                  placeholder="10-digit mobile"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Helps you recognise the reservation if you park it.
              </p>
            </div>

            <button type="button" onClick={doHold}
              disabled={pending || selected.size === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40">
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Next: reserve {selected.size > 0 ? `${selected.size} seat${selected.size > 1 ? "s" : ""}` : "seats"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              Holds the seats while payment is arranged. Serve the next customer
              and come back to it under{" "}
              <strong className="font-medium text-ink-700">Reserved seats</strong>.
            </p>
          </section>
        )}

        {phase === "HELD" && hold && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink-800">Adjust reserved seats</h2>
            <p className="text-xs text-ink-600">
              Reserved: {selectedRows.map((row) => row.seatNumber).join(", ")}
            </p>
            <button type="button" onClick={() => setMobileStep("SEATS")}
              className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50">
              Change seats
            </button>
          </div>
        )}

        {phase === "HELD" && hold && (
          <ConfirmPanel
            hold={hold} rows={selectedRows} points={points}
            direction={trip.direction}
            extraPersonSinglePaise={trip.extraPersonSinglePaise}
            extraPersonDoublePaise={trip.extraPersonDoublePaise}
            initialName={customerHint.name} initialPhone={customerHint.phone}
            defaultFareFor={defaultFareFor}
            onRelease={doRelease}
            seatsChanged={heldSeatIds.size !== selected.size ||
              [...heldSeatIds].some((id) => !selected.has(id))}
            onUpdateSeats={updateHeldSeats}
            onExtend={doExtend}
            onExpired={() => {
              setError("The reservation expired. Please select the seats again.");
              setHold(null); setHeldSeatIds(new Set());
              setPhase("SELECTING"); setSelected(new Set());
            }}
            onDone={(r) => { setResult(r); setPhase("DONE"); }}
          />
        )}
      </aside>

      {phase === "HELD" && (
        <div className="sm:hidden">
          <button type="button" onClick={updateHeldSeats}
            disabled={pending || selectedRows.length === 0}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            Apply seat changes and continue
          </button>
          <p className="mt-2 text-center text-[11px] text-ink-500">
            At least one seat must stay reserved. Use Release seats to cancel this reservation.
          </p>
        </div>
      )}

      </div>

      {splitPrompt && (
        <SplitSofaDialog
          seatNumber={splitPrompt.seatNumber}
          partnerNumber={splitPrompt.partnerNumber}
          onCancel={() => setSplitPrompt(null)}
          onConfirm={confirmSplit}
        />
      )}
    </div>
  );
}

function SplitSofaDialog({ seatNumber, partnerNumber, onCancel, onConfirm }: {
  seatNumber: string; partnerNumber: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="split-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <h2 id="split-title" className="text-sm font-semibold text-ink-900">
          Split this double sofa?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {seatNumber} and {partnerNumber} are the two halves of one double sofa.
          Removing {seatNumber} sells {partnerNumber} on its own, so whoever books
          it will share the sofa with a stranger.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
            Keep both
          </button>
          <button type="button" onClick={onConfirm} autoFocus
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700">
            Sell {partnerNumber} alone
          </button>
        </div>
      </div>
    </div>
  );
}

function TripBar({ trip }: { trip: TripHeader }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      <div>
        <h1 className="text-sm font-semibold text-ink-900">
          {journeyLabel(trip.origin, trip.destination, trip.direction)}
          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
            {directionLabel(trip.direction)}
          </span>
        </h1>
        <p className="mt-0.5 text-xs text-ink-500">
          {trip.busName} · {trip.registrationNo}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-ink-900">
          {formatTime(trip.departureAt)}
        </p>
        <p className="text-[11px] text-ink-500">{trip.serviceDate}</p>
      </div>
    </div>
  );
}

function SelectedList({ rows, fareOf, onRemove }: {
  rows: SeatStateRow[]; fareOf: (s: SeatStateRow) => number;
  onRemove?: (seatId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-xs text-ink-500">
      No seats selected yet. Click the map, or type the numbers above.
    </p>;
  }
  const total = rows.reduce((t, r) => t + fareOf(r), 0);
  const groups = [
    { title: "Single sofa", rows: rows.filter((row) => row.berthType === "SLEEPER_SINGLE") },
    { title: "Double sofa", rows: rows.filter((row) => row.berthType === "SLEEPER_DOUBLE") },
    { title: "Cabin", rows: rows.filter((row) => row.berthType === "CABIN") },
  ].filter((group) => group.rows.length > 0);
  return (
    <div>
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{group.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.rows.map((r) => (
                <span key={r.seatId}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">
                  {r.seatNumber}
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(r.seatId)}
                      aria-label={`Remove seat ${r.seatNumber}`}
                      className="rounded text-brand-500 hover:text-brand-800">
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 flex justify-between text-xs">
        <span className="text-ink-500">{rows.length} seat{rows.length > 1 ? "s" : ""}</span>
        <span className="font-semibold tabular-nums text-ink-900">{formatINR(total)}</span>
      </p>
    </div>
  );
}

function BookingDone({ result, onNew }: {
  result: {
    bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number;
    seatChargePaise: number;
    singleExtraPersonCount: number; singleExtraPersonChargePaise: number;
    doubleExtraPersonCount: number; doubleExtraPersonChargePaise: number;
  };
  onNew: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={36} />
      <h2 className="text-base font-semibold text-emerald-900">Booking confirmed</h2>
      <p className="mt-1 text-sm text-emerald-800">
        {result.seatNumbers.length} seat{result.seatNumbers.length === 1 ? "" : "s"} ({result.seatNumbers.join(", ")}) · {formatINR(result.seatChargePaise)}
      </p>
      <p className="mt-1 text-xs text-emerald-800">
        {result.singleExtraPersonCount > 0 && (
          <>+ {result.singleExtraPersonCount} single-sofa extra {result.singleExtraPersonCount === 1 ? "person" : "people"} · {formatINR(result.singleExtraPersonChargePaise)}{" "}</>
        )}
        {result.doubleExtraPersonCount > 0 && (
          <>+ {result.doubleExtraPersonCount} double-sofa extra {result.doubleExtraPersonCount === 1 ? "person" : "people"} · {formatINR(result.doubleExtraPersonChargePaise)}{" "}</>
        )}
        {"= "}<strong>{formatINR(result.amountTotalPaise)} total</strong>
      </p>
      <p className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-lg font-bold tracking-wider text-ink-900">
        {result.pnr}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Ticket size={15} /> Book another
        </button>
        <a href={`/tickets/${result.bookingId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          <Printer size={15} /> Print ticket
        </a>
        <a href={`/bookings/${result.bookingId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          Edit booking
        </a>
        <a href="/holds"
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          Reserved seats
        </a>
      </div>
    </div>
  );
}

/* ─────────────────── the customer + payment form ─────────────────── */

function ExtraPersonFields({
  label, count, onCountChange, charge, onChargeChange, total, seats,
}: {
  label: string;
  count: string;
  onCountChange: (value: string) => void;
  charge: string;
  onChargeChange: (value: string) => void;
  total: number;
  seats: string[];
}) {
  return (
    <div className="rounded-lg bg-ink-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <strong className="text-xs text-ink-800">{label}</strong>
        <span className="text-[11px] text-ink-500">{seats.join(", ")}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-600">
          Extra people
          <input type="number" min={0} max={20} step={1} value={count}
            onChange={(e) => onCountChange(e.target.value)}
            aria-label={`Extra people for ${label.toLowerCase()}s`}
            className={cn(inp(false), "mt-1 tabular-nums")} />
        </label>
        <label className="text-[11px] text-ink-600">
          Charge each (₹)
          <input type="number" min={0} step="0.01" value={charge}
            onChange={(e) => onChargeChange(e.target.value)}
            aria-label={`Extra-person charge for ${label.toLowerCase()}s`}
            className={cn(inp(false), "mt-1 tabular-nums")} />
        </label>
      </div>
      <p className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-[11px] text-ink-600">
        <span>{count || 0} × {formatINR(Math.round((Number(charge) || 0) * 100))}</span>
        <strong className="text-ink-800">{formatINR(Math.round(total * 100))}</strong>
      </p>
    </div>
  );
}

function ConfirmPanel({
  hold, rows, points, direction, extraPersonSinglePaise, extraPersonDoublePaise,
  initialName, initialPhone, seatsChanged, onUpdateSeats,
  defaultFareFor, onRelease, onExtend, onExpired, onDone,
}: {
  hold: { holdId: string; expiresAt: string; serverNow: string };
  rows: SeatStateRow[];
  points: PointOption[];
  direction: "ONWARD" | "RETURN";
  extraPersonSinglePaise: number;
  extraPersonDoublePaise: number;
  initialName: string;
  initialPhone: string;
  seatsChanged: boolean;
  onUpdateSeats: () => void;
  defaultFareFor: (s: SeatStateRow) => number;
  onRelease: () => void;
  onExtend: () => void;
  onExpired: () => void;
  onDone: (r: {
    bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number;
    seatChargePaise: number;
    singleExtraPersonCount: number; singleExtraPersonChargePaise: number;
    doubleExtraPersonCount: number; doubleExtraPersonChargePaise: number;
  }) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerName, setCustomerName] = useState(initialName);
  const [customerPhone, setCustomerPhone] = useState(initialPhone);
  const [paymentType, setPaymentType] = useState<"CASH" | "ONLINE" | "PENDING">("CASH");
  const [boardingPointId, setBoardingPointId] = useState("");
  const [boardingName, setBoardingName] = useState("");
  const [droppingPointId, setDroppingPointId] = useState("");
  const [droppingName, setDroppingName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passengerGender, setPassengerGender] = useState<"" | "M" | "F" | "O">("");
  const [pricingTab, setPricingTab] = useState<"FARES" | "EXTRAS">("FARES");

  const [groupFares, setGroupFares] = useState<Record<string, string>>({});
  const [singleExtraPersonCount, setSingleExtraPersonCount] = useState("0");
  const [doubleExtraPersonCount, setDoubleExtraPersonCount] = useState("0");
  const [singleExtraPersonCharge, setSingleExtraPersonCharge] = useState("");
  const [doubleExtraPersonCharge, setDoubleExtraPersonCharge] = useState("");
  const singleSofas = rows.filter((row) => row.berthType === "SLEEPER_SINGLE");
  const doubleSofas = rows.filter((row) => row.berthType === "SLEEPER_DOUBLE");
  const singleExtraChargeValue = singleExtraPersonCharge ||
    String(extraPersonSinglePaise / 100);
  const doubleExtraChargeValue = doubleExtraPersonCharge ||
    String(extraPersonDoublePaise / 100);
  const fareValue = (row: SeatStateRow) =>
    groupFares[row.berthType] ?? String(defaultFareFor(row) / 100);

  // On the return leg the bus starts from the far end, so the route's two stop
  // lists swap over — otherwise the counter offers Rajkot pickups for a bus
  // leaving Mumbai.
  const kinds = pointKindsFor(direction);
  const pickups = points.filter((p) => p.kind === kinds.pickup);
  const drops = points.filter((p) => p.kind === kinds.drop);
  const singleExtraTotalRupees = singleSofas.length > 0
    ? Number(singleExtraPersonCount || 0) * Number(singleExtraChargeValue || 0)
    : 0;
  const doubleExtraTotalRupees = doubleSofas.length > 0
    ? Number(doubleExtraPersonCount || 0) * Number(doubleExtraChargeValue || 0)
    : 0;
  const totalRupees = rows.reduce((t, r) => t + (Number(fareValue(r)) || 0), 0)
    + singleExtraTotalRupees + doubleExtraTotalRupees;
  const seatsTotalRupees = rows.reduce((total, row) =>
    total + (Number(fareValue(row)) || 0), 0);
  const extraTotalRupees = singleExtraTotalRupees + doubleExtraTotalRupees;

  function submit() {
    setError(null); setFieldErrors({});
    if (!customerName.trim()) {
      setFieldErrors({ customerName: "Enter the customer's name" });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(customerPhone)) {
      setFieldErrors({ customerPhone: "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9" });
      return;
    }
    const invalidSeatInput = rows.some((row) =>
      !/^\d+(\.\d{1,2})?$/.test(fareValue(row).trim()))
      || (singleSofas.length > 0 &&
        (!/^\d+$/.test(singleExtraPersonCount) || Number(singleExtraPersonCount) > 20 ||
          !/^\d+(\.\d{1,2})?$/.test(singleExtraChargeValue.trim())))
      || (doubleSofas.length > 0 &&
        (!/^\d+$/.test(doubleExtraPersonCount) || Number(doubleExtraPersonCount) > 20 ||
          !/^\d+(\.\d{1,2})?$/.test(doubleExtraChargeValue.trim())));
    if (invalidSeatInput) {
      setError("Enter valid group seat charges and an extra-person count from 0 to 20.");
      return;
    }
    start(async () => {
      const res = await confirmBookingAction({
        holdId: hold.holdId,
        customerName, customerPhone,
        paymentType,
        amountPaid: paymentType === "PENDING" ? 0 : totalRupees,
        boardingPointId: boardingPointId || null,
        boardingName: boardingPointId ? "" : boardingName,
        droppingPointId: droppingPointId || null,
        droppingName: droppingPointId ? "" : droppingName,
        note,
        seats: rows.map((r) => {
          const isFirstSingle = r.seatId === singleSofas[0]?.seatId;
          const isFirstDouble = r.seatId === doubleSofas[0]?.seatId;
          return {
            seatId: r.seatId,
            gender: passengerGender || null,
            fare: fareValue(r) || 0,
            extraPersonCount: isFirstSingle ? Number(singleExtraPersonCount || 0)
              : isFirstDouble ? Number(doubleExtraPersonCount || 0) : 0,
            extraPersonCharge: isFirstSingle ? singleExtraChargeValue
              : isFirstDouble ? doubleExtraChargeValue : 0,
          };
        }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not complete the booking.");
        setFieldErrors(res.fieldErrors ?? {});
        if (res.code === "HOLD_EXPIRED") onExpired();
        return;
      }
      onDone({
        bookingId: res.data.bookingId,
        pnr: res.data.pnr,
        seatNumbers: res.data.seatNumbers,
        amountTotalPaise: res.data.amountTotalPaise,
        seatChargePaise: Math.round(seatsTotalRupees * 100),
        singleExtraPersonCount: singleSofas.length > 0 ? Number(singleExtraPersonCount || 0) : 0,
        singleExtraPersonChargePaise: Math.round(singleExtraTotalRupees * 100),
        doubleExtraPersonCount: doubleSofas.length > 0 ? Number(doubleExtraPersonCount || 0) : 0,
        doubleExtraPersonChargePaise: Math.round(doubleExtraTotalRupees * 100),
      });
    });
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-[var(--surface)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Customer details</h2>
        <HoldTimer expiresAt={hold.expiresAt} serverNow={hold.serverNow}
          onExpire={onExpired} />
      </header>

      <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
          Reserved for you
        </p>
        <p className="mt-0.5 text-sm font-semibold text-brand-900">
          {rows.map((r) => r.seatNumber).join(", ")}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-ink-500">
        Tip: press Tab to move forward through fields, or Shift+Tab to move back.
      </p>
      {seatsChanged && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            Your seat selection changed. Apply it to the reservation before confirming.
          </p>
          <button type="button" onClick={onUpdateSeats} disabled={pending || rows.length === 0}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Update reserved seats
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <F id="booking-customer-name" label="Customer name" error={fieldErrors.customerName} required>
          <input id="booking-customer-name" value={customerName} autoComplete="name"
            maxLength={120} required aria-invalid={!!fieldErrors.customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setFieldErrors((errors) => ({ ...errors, customerName: "" }));
            }}
            placeholder="Full name" className={inp(!!fieldErrors.customerName)} />
        </F>
        <F id="booking-customer-phone" label="10-digit mobile number" error={fieldErrors.customerPhone} required>
          <input id="booking-customer-phone" value={customerPhone} type="tel"
            inputMode="numeric" autoComplete="tel-national" maxLength={10}
            required pattern="[6-9][0-9]{9}"
            title="Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9"
            aria-invalid={!!fieldErrors.customerPhone}
            onChange={(e) => {
              setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
              setFieldErrors((errors) => ({ ...errors, customerPhone: "" }));
            }}
            placeholder="9876543210" className={inp(!!fieldErrors.customerPhone)} />
          <p className="mt-1 text-[11px] text-ink-500">
            Enter 10 digits only, without the country code.
          </p>
        </F>
        <F label="Passenger gender">
          <select value={passengerGender}
            onChange={(e) => setPassengerGender(e.target.value as "" | "M" | "F" | "O")}
            className={cn(inp(false), "bg-white")}>
            <option value="">Not specified</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
          <p className="mt-1 text-[11px] text-ink-400">
            Optional; applied to all seats in this booking.
          </p>
        </F>

        <div className="grid grid-cols-2 gap-3">
          <F label="Pickup">
            {pickups.length > 0 ? (
              <select value={boardingPointId} className={cn(inp(false), "bg-white")}
                onChange={(e) => setBoardingPointId(e.target.value)}>
                <option value="">Type instead…</option>
                {pickups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input value={boardingName} onChange={(e) => setBoardingName(e.target.value)}
                placeholder="Pickup point" className={inp(false)} />
            )}
          </F>
          <F label="Destination">
            {drops.length > 0 ? (
              <select value={droppingPointId} className={cn(inp(false), "bg-white")}
                onChange={(e) => setDroppingPointId(e.target.value)}>
                <option value="">Type instead…</option>
                {drops.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input value={droppingName} onChange={(e) => setDroppingName(e.target.value)}
                placeholder="Drop point" className={inp(false)} />
            )}
          </F>
        </div>

        {pickups.length > 0 && !boardingPointId && (
          <input value={boardingName} onChange={(e) => setBoardingName(e.target.value)}
            placeholder="Pickup — type a one-off location" className={inp(false)} />
        )}
        {drops.length > 0 && !droppingPointId && (
          <input value={droppingName} onChange={(e) => setDroppingName(e.target.value)}
            placeholder="Destination — type a one-off location" className={inp(false)} />
        )}

        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-xs font-semibold text-ink-700">Pricing</legend>
          <div role="tablist" aria-label="Booking pricing options"
            className="mb-3 grid grid-cols-2 rounded-lg bg-ink-100 p-1">
            <button type="button" role="tab" aria-selected={pricingTab === "FARES"}
              aria-controls="booking-seat-fares" onClick={() => setPricingTab("FARES")}
              className={cn("rounded-md px-3 py-2 text-xs font-semibold transition",
                pricingTab === "FARES" ? "bg-white text-brand-700 shadow-sm" : "text-ink-600 hover:text-ink-900")}>
              Seat fares
            </button>
            <button type="button" role="tab" aria-selected={pricingTab === "EXTRAS"}
              aria-controls="booking-extra-people" onClick={() => setPricingTab("EXTRAS")}
              className={cn("rounded-md px-3 py-2 text-xs font-semibold transition",
                pricingTab === "EXTRAS" ? "bg-white text-brand-700 shadow-sm" : "text-ink-600 hover:text-ink-900")}>
              Extra people
              {(Number(singleExtraPersonCount) + Number(doubleExtraPersonCount)) > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px]">
                  {Number(singleExtraPersonCount) + Number(doubleExtraPersonCount)}
                </span>
              )}
            </button>
          </div>
          {pricingTab === "FARES" ? (
            <div id="booking-seat-fares" role="tabpanel" className="space-y-2">
              {([
                ["SLEEPER_SINGLE", "Single sofa"],
                ["SLEEPER_DOUBLE", "Double sofa"],
                ["CABIN", "Cabin"],
              ] as const).map(([type, label]) => {
                const groupRows = rows.filter((row) => row.berthType === type);
                if (groupRows.length === 0) return null;
                return (
                  <div key={type} className="grid grid-cols-[1fr_7.5rem] items-center gap-2 rounded-lg bg-ink-50 p-2.5 text-xs text-ink-700">
                    <span className="min-w-0">
                      <strong>{label}</strong>
                      <span className="block truncate text-[11px] text-ink-500">
                        {groupRows.length} seat{groupRows.length === 1 ? "" : "s"} · {groupRows.map((row) => row.seatNumber).join(", ")}
                      </span>
                    </span>
                    <label className="text-[11px] text-ink-600">
                      Fare each (₹)
                      <input type="number" min={0} step="0.01" value={fareValue(groupRows[0])}
                        onChange={(e) => setGroupFares((current) => ({ ...current, [type]: e.target.value }))}
                        aria-label={`Price for each ${label.toLowerCase()} seat`}
                        className={cn(inp(false), "mt-1 tabular-nums")} />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <div id="booking-extra-people" role="tabpanel" className="space-y-3">
              <p className="text-[11px] text-ink-500">
                Extra passengers use separate rates for each sofa type.
              </p>
              {singleSofas.length > 0 && (
                <ExtraPersonFields label="Single sofa"
                  count={singleExtraPersonCount} onCountChange={setSingleExtraPersonCount}
                  charge={singleExtraChargeValue} onChargeChange={setSingleExtraPersonCharge}
                  total={singleExtraTotalRupees}
                  seats={singleSofas.map((seat) => seat.seatNumber)} />
              )}
              {doubleSofas.length > 0 && (
                <ExtraPersonFields label="Double sofa"
                  count={doubleExtraPersonCount} onCountChange={setDoubleExtraPersonCount}
                  charge={doubleExtraChargeValue} onChargeChange={setDoubleExtraPersonCharge}
                  total={doubleExtraTotalRupees}
                  seats={doubleSofas.map((seat) => seat.seatNumber)} />
              )}
              {singleSofas.length === 0 && doubleSofas.length === 0 && (
                <p className="rounded-lg bg-ink-50 px-3 py-4 text-center text-xs text-ink-500">
                  Extra passengers are available for sleeper sofas only.
                </p>
              )}
            </div>
          )}
        </fieldset>
        <div className="rounded-lg border border-[var(--border)] bg-ink-50 px-3 py-2 text-xs">
          <p className="flex justify-between text-ink-600">
            <span>Seat charges</span><span>{formatINR(Math.round(seatsTotalRupees * 100))}</span>
          </p>
          <p className="mt-1 flex justify-between text-ink-600">
            <span>Single sofa extra charge</span><span>{formatINR(Math.round(singleExtraTotalRupees * 100))}</span>
          </p>
          <p className="mt-1 flex justify-between text-ink-600">
            <span>Double sofa extra charge</span><span>{formatINR(Math.round(doubleExtraTotalRupees * 100))}</span>
          </p>
          <p className="mt-1 flex justify-between font-medium text-ink-700">
            <span>All extra-person charges</span><span>{formatINR(Math.round(extraTotalRupees * 100))}</span>
          </p>
          <p className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-sm">
            <span className="font-semibold text-ink-800">Total</span>
            <span className="font-bold tabular-nums text-ink-900">
              {formatINR(Math.round(totalRupees * 100))}
            </span>
          </p>
        </div>

        <F label="Payment">
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ["CASH", "Cash"],
              ["ONLINE", "Online"],
              ["PENDING", "Pay later"],
            ] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setPaymentType(v)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition",
                  paymentType === v
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-[var(--border)] text-ink-700 hover:bg-ink-50",
                )}>
                {label}
              </button>
            ))}
          </div>
          {paymentType === "PENDING" && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Nothing collected now. The booking is confirmed and shows as unpaid
              until someone records the payment.
            </p>
          )}
        </F>

        <F label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Optional" className={inp(false)} />
        </F>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button type="button" onClick={submit}
          disabled={pending || seatsChanged || !customerName.trim() || !customerPhone.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />}
          Confirm booking
        </button>

        <button type="button" disabled={pending || seatsChanged}
          onClick={() => start(async () => {
            await parkHoldAction(hold.holdId, customerName, customerPhone);
            router.push("/holds");
          })}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40">
          <PauseCircle size={15} /> Park it — confirm after payment
        </button>
        <p className="-mt-1 text-[11px] leading-relaxed text-ink-500">
          Keeps the seats reserved and takes you back to the queue. Find it again
          under Reserved seats.
        </p>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={onExtend} disabled={pending}
            className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900">
            <RefreshCw size={12} /> Add more time
          </button>
          <button type="button" onClick={onRelease} disabled={pending}
            className="text-red-600 hover:underline">
            Release seats
          </button>
        </div>
      </div>
    </section>
  );
}

function inp(hasError: boolean) {
  return cn("w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    hasError ? "border-red-400 bg-red-50"
      : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100");
}

function F({ id, label, error, required, children }: {
  id?: string; label: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
