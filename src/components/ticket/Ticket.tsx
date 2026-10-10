import { OFFICE_TZ } from "@/lib/time";
import type { OfficeDetails } from "@/lib/office";
import { journeyOf } from "@/lib/journey";
import type { TicketData } from "@/server/services/ticket";

const PAYMENT_LABEL: Record<TicketData["paymentType"], string> = {
  CASH: "રોકડ", ONLINE: "ઑનલાઇન", PENDING: "બાકી",
};

function shortDate(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("gu-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function officeDateTime(d: Date) {
  return new Intl.DateTimeFormat("gu-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: OFFICE_TZ,
  }).format(d);
}

function gujaratiINR(paise: number) {
  return new Intl.NumberFormat("gu-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(paise / 100);
}

/**
 * One ticket.
 *
 * Sizing and which optional blocks appear are driven entirely by CSS keyed off
 * the sheet's print format, not by a prop: the format toggle is client state
 * and the ticket is rendered on the server, so switching between 8-per-page and
 * A5 has to work without re-rendering this markup.
 *
 * Ticket labels are Gujarati; passenger-provided identifiers remain unchanged
 * so phone, booking and vehicle numbers can be dialled or matched reliably.
 */
export function Ticket({
  ticket, office,
}: { ticket: TicketData; office: OfficeDetails }) {
  const due = ticket.amountTotalPaise - ticket.amountPaidPaise;
  const cancelled = ticket.status === "CANCELLED";
  const seatList = ticket.seats.map((s) => s.seatNumber).join(", ");
  const journey = journeyOf(ticket.origin, ticket.destination, ticket.direction);
  const extraPersonCount = ticket.seats.reduce((count, seat) => count + seat.extraPersonCount, 0);
  const extraPersonChargePaise = ticket.seats.reduce((total, seat) =>
    total + seat.extraPersonCount * seat.extraPersonChargePaise, 0);
  const seatChargePaise = ticket.amountTotalPaise - extraPersonChargePaise;

  return (
    <article className="ticket" lang="gu">
      {cancelled && (
        <span aria-hidden className="t-void">રદ કરેલ</span>
      )}

      <div className="ticket-content">
      <header className="t-head">
        <div className="t-brand">
          <span className="t-op">{office.name}</span>
          {office.tagline && <span className="t-contact">{office.tagline}</span>}
          <span className="t-pnr"><span className="t-pnr-label">ટિકિટ નં.</span> {ticket.pnr}</span>
        </div>
        <div className="t-office-grid">
          <div className="t-office t-office-left">
            <span className="t-office-label">ઓફિસ ૧</span>
            <span className="t-contact t-address">{office.address}</span>
            <span className="t-contact t-phone">{office.phone && <>ફોન: <strong>{office.phone}</strong></>}</span>
          </div>
          <div className="t-office t-office-center">
            <span className="t-office-label">ઓફિસ ૨</span>
            <span className="t-contact t-address">{office.altAddress}</span>
            <span className="t-contact t-phone">{office.altPhone && <>ફોન: <strong>{office.altPhone}</strong></>}</span>
          </div>
          <div className="t-office t-office-right">
            <span className="t-office-label">ઓફિસ ૩</span>
            <span className="t-contact t-address">{office.thirdAddress}</span>
            <span className="t-contact t-phone">{office.thirdPhone && <>ફોન: <strong>{office.thirdPhone}</strong></>}</span>
          </div>
        </div>
      </header>

      <div className="t-dates">
        <div className="t-date-primary">
          <span className="t-label">પ્રવાસ તારીખ</span>
          <strong>{shortDate(ticket.serviceDate)}</strong>
        </div>
        <div className="t-date-booked">
          <span className="t-label">બુકિંગ તારીખ</span>
          <strong>{officeDateTime(ticket.bookedAt)}</strong>
        </div>
      </div>

      <div className="t-band">
        <span className="t-route">
          {journey.from} <span className="t-arrow">થી</span> {journey.to}
        </span>
        <span className="t-when">ઉપડવાનો સમય {new Intl.DateTimeFormat("gu-IN", {
          hour: "2-digit", minute: "2-digit", hour12: true, timeZone: OFFICE_TZ,
        }).format(ticket.departureAt)}</span>
      </div>

      <div className="t-main">
        <div className="t-who">
          <p className="t-label">મુસાફરનું નામ</p>
          <p className="t-name">{ticket.customerName}</p>
          <p className="t-sub">મોબાઇલ નંબર: <span className="t-phone-number">{ticket.customerPhone}</span></p>
          <p className="t-bus">
            <span className="t-bus-label">બસ નંબર:</span> {ticket.registrationNo}
          </p>
        </div>
        <div className="t-seatbox">
          <p className="t-seatlabel">સીટ નંબર</p>
          <p className="t-seats">
            {seatList}
            {extraPersonCount > 0 && <span className="t-extra-seat-count"> + {extraPersonCount}</span>}
          </p>
        </div>
      </div>

      <div className="t-stops">
        <p>
          <span className="t-stop-label">પિકઅપ સ્થળ</span>
          <strong>{ticket.boardingName ?? "જણાવ્યા મુજબ"}</strong>
        </p>
      </div>

      <div className="t-money">
        <div className="t-fare">
          <p><span>સીટ ભાડું ({ticket.seats.length}):</span> <strong>{gujaratiINR(seatChargePaise)}</strong></p>
          {extraPersonCount > 0 && (
            <p><span>વધારાની વ્યક્તિ ({extraPersonCount}):</span> <strong>+ {gujaratiINR(extraPersonChargePaise)}</strong></p>
          )}
          {ticket.note && <p className="t-note"><span>નોંધ:</span> {ticket.note}</p>}
          <p className="t-pay">
            ચુકવણી: {PAYMENT_LABEL[ticket.paymentType]}
            {due > 0
              ? <span className="t-payment-alert">બાકી: {gujaratiINR(due)}</span>
              : <span className="t-paid"> · ચૂકવેલ</span>}
          </p>
        </div>
        <div className="t-totalbox">
          <span className="t-label">કુલ ભાડું</span>
          <strong className="t-total">{gujaratiINR(ticket.amountTotalPaise)}</strong>
        </div>
      </div>
      </div>

      <section className="office-memo" lang="gu" aria-label="Office copy">
        <header className="office-memo-head">
          <strong>ઓફિસ મેમો</strong>
          <span>ટિકિટ નં. {ticket.pnr}</span>
        </header>
        <div className="office-memo-grid">
          <p><span>નામ</span><strong>{ticket.customerName}</strong></p>
          <p><span>મોબાઇલ નંબર</span><strong>{ticket.customerPhone}</strong></p>
          <p><span>સીટ નંબર</span><strong>{seatList}{extraPersonCount > 0 ? ` + ${extraPersonCount}` : ""}</strong></p>
          <p className="office-memo-price"><span>સીટ ભાડું</span><strong>{gujaratiINR(seatChargePaise)}</strong></p>
          {extraPersonCount > 0 && (
            <p className="office-memo-price"><span>વધારાની વ્યક્તિ</span><strong>{extraPersonCount} · {gujaratiINR(extraPersonChargePaise)}</strong></p>
          )}
          <p><span>બુકિંગ તારીખ</span><strong>{officeDateTime(ticket.bookedAt)}</strong></p>
          <p><span>પ્રવાસ તારીખ</span><strong>{shortDate(ticket.serviceDate)}</strong></p>
          <p><span>બસ નંબર</span><strong>{ticket.registrationNo}</strong></p>
          <p><span>પિકઅપ</span><strong>{ticket.boardingName ?? "જણાવ્યા મુજબ"}</strong></p>
          <p><span>ડ્રોપ</span><strong>{ticket.droppingName ?? "જણાવ્યા મુજબ"}</strong></p>
          <p><span>બુક કરનાર</span><strong>{ticket.bookedByName}</strong></p>
        </div>
        <p className="office-memo-total">કુલ ભાડું: {gujaratiINR(ticket.amountTotalPaise)}</p>
      </section>
    </article>
  );
}
