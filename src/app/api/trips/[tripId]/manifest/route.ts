import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { moneyPaise, styledExcelWorkbook } from "@/lib/excel";
import { formatDateTime } from "@/lib/time";
import { getTicketsForTrip, getTripHeader } from "@/server/services/ticket";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  await requireSession();
  const { tripId } = await params;
  const [header, tickets] = await Promise.all([
    getTripHeader(tripId),
    getTicketsForTrip(tripId, { orderByPickup: true }),
  ]);
  if (!header) return new NextResponse("Trip not found", { status: 404 });

  const highlightedRows: number[] = [];
  const rows = tickets.map((ticket, index) => {
    const singleExtras = ticket.seats.filter((seat) =>
      seat.berthType === "SLEEPER_SINGLE");
    const doubleExtras = ticket.seats.filter((seat) =>
      seat.berthType === "SLEEPER_DOUBLE");
    const singleExtraCount = singleExtras.reduce(
      (count, seat) => count + seat.extraPersonCount, 0);
    const singleExtraChargePaise = singleExtras.reduce((total, seat) =>
      total + seat.extraPersonCount * seat.extraPersonChargePaise, 0);
    const doubleExtraCount = doubleExtras.reduce(
      (count, seat) => count + seat.extraPersonCount, 0);
    const doubleExtraChargePaise = doubleExtras.reduce((total, seat) =>
      total + seat.extraPersonCount * seat.extraPersonChargePaise, 0);
    if (ticket.amountTotalPaise > ticket.amountPaidPaise) highlightedRows.push(index);
    return [
      ticket.pnr, formatDateTime(ticket.bookedAt),
      ticket.customerName, ticket.customerPhone,
      ticket.seats.map((seat) => seat.seatNumber).join(", "),
      singleExtraCount > 0
        ? `${singleExtraCount} ${singleExtraCount === 1 ? "person" : "people"} · ${moneyPaise(singleExtraChargePaise)}`
        : "—",
      doubleExtraCount > 0
        ? `${doubleExtraCount} ${doubleExtraCount === 1 ? "person" : "people"} · ${moneyPaise(doubleExtraChargePaise)}`
        : "—",
      header.busName, header.registrationNo, ticket.paymentType,
      ticket.paymentStatus, ticket.status, moneyPaise(ticket.amountTotalPaise),
      moneyPaise(ticket.amountPaidPaise), ticket.boardingName ?? "—",
      ticket.droppingName ?? "—",
    ];
  });
  const title = `Passenger manifest ${header.routeCode} ${header.serviceDate}`;
  const workbook = await styledExcelWorkbook(title, [
    "PNR", "Booked", "Name", "Phone", "Seats", "Single extra", "Double extra",
    "Bus", "Bus no.", "Pay type", "Payment", "Status", "Total", "Paid",
    "Pickup", "Drop",
  ], rows, highlightedRows);
  const body = new ArrayBuffer(workbook.byteLength);
  new Uint8Array(body).set(workbook);

  return new NextResponse(new Blob([body]), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="manifest-${header.routeCode}-${header.serviceDate}.xlsx"`,
  }});
}
