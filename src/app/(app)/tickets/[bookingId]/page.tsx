import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, Clock3, Pencil, Ticket as TicketIcon,
} from "lucide-react";
import { requireSession } from "@/server/auth";
import { getTicket } from "@/server/services/ticket";
import { getOfficeDetails } from "@/lib/office";
import { formatTime } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";
import { Ticket } from "@/components/ticket/Ticket";
import { PrintSheet } from "@/components/ticket/PrintSheet";
import { CancelBookingButton } from "@/app/(app)/bookings/CancelBookingButton";

export const dynamic = "force-dynamic";

function ticketFileName(name: string, travelDate: string) {
  const customer = name.normalize("NFKC").trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "ticket";
  return `${customer}-${travelDate}`;
}

function readableDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(paise / 100);
}

export async function generateMetadata({
  params,
}: { params: Promise<{ bookingId: string }> }): Promise<Metadata> {
  await requireSession();
  const { bookingId } = await params;
  const ticket = await getTicket(bookingId);
  if (!ticket) return { title: "Ticket not found" };
  return { title: ticketFileName(ticket.customerName, ticket.serviceDate) };
}

export default async function TicketPage({
  params,
}: { params: Promise<{ bookingId: string }> }) {
  await requireSession();
  const { bookingId } = await params;

  const ticket = await getTicket(bookingId);
  if (!ticket) notFound();
  const office = await getOfficeDetails();
  const seatNumbers = ticket.seats.map((seat) => seat.seatNumber).join(", ");
  const extraPersonCount = ticket.seats.reduce((count, seat) => count + seat.extraPersonCount, 0);
  const statusLabel: Record<typeof ticket.status, string> = {
    CONFIRMED: "Confirmed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No show",
    COMPLETED: "Completed",
  };
  const statusStyle = ticket.status === "CANCELLED"
    ? "bg-red-50 text-red-700 ring-red-200"
    : ticket.status === "CONFIRMED"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-ink-100 text-ink-700 ring-ink-200";

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 xl:p-8">
      <Link href="/bookings"
        className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-brand-700">
        <ChevronLeft size={16} /> All bookings
      </Link>

      <section className="no-print mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusStyle}`}>
            {ticket.status === "CONFIRMED" && <Check size={12} strokeWidth={3} />}
            {statusLabel[ticket.status]}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-ink-500">
            <TicketIcon size={13} /> {ticket.pnr}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {ticket.status !== "CANCELLED" && (
              <>
                <Link href={`/bookings/${ticket.bookingId}/edit`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                  <Pencil size={13} /> Edit
                </Link>
                <CancelBookingButton bookingId={ticket.bookingId} />
              </>
            )}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-ink-900">
            {journeyLabel(ticket.origin, ticket.destination, ticket.direction)}
          </span>
          <ArrowRight size={14} className="text-ink-300" />
          <span className="inline-flex items-center gap-1 text-ink-600">
            <CalendarDays size={13} className="text-brand-600" /> {readableDate(ticket.serviceDate)}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-600">
            <Clock3 size={13} className="text-brand-600" /> {formatTime(ticket.departureAt)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-ink-100 pt-2.5 text-xs sm:grid-cols-4">
          <div className="min-w-0">
            <p className="text-ink-500">Passenger</p>
            <p className="truncate font-semibold text-ink-800">{ticket.customerName} · {ticket.customerPhone}</p>
          </div>
          <div className="min-w-0">
            <p className="text-ink-500">Seats{extraPersonCount > 0 ? " + extra" : ""}</p>
            <p className="truncate font-semibold text-ink-800">
              {seatNumbers}{extraPersonCount > 0 ? ` + ${extraPersonCount}` : ""}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-ink-500">Bus · pickup</p>
            <p className="truncate font-semibold text-ink-800">{ticket.registrationNo} · {ticket.boardingName ?? "By arrangement"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-ink-500">Fare · payment</p>
            <p className="truncate font-semibold text-ink-800">
              {formatPrice(ticket.amountTotalPaise)} · {ticket.amountTotalPaise > ticket.amountPaidPaise
                ? `${formatPrice(ticket.amountTotalPaise - ticket.amountPaidPaise)} due`
                : "Paid"}
            </p>
          </div>
        </div>
      </section>

      <PrintSheet count={1} defaultFormat="a5"
        downloadFileName={ticketFileName(ticket.customerName, ticket.serviceDate)}
        subtitle={`${ticket.pnr} · ${ticket.customerName} · seat ${seatNumbers}${extraPersonCount > 0 ? ` + ${extraPersonCount} extra` : ""}`}>
        <Ticket ticket={ticket} office={office} />
      </PrintSheet>
    </div>
  );
}
