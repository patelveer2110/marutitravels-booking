import {
  confirmBookingSchema, generateTripsSchema, holdSeatsSchema, updateHoldSeatsSchema,
} from "../../src/lib/schemas";

let pass = 0, fail = 0;
const check = (name: string, condition: boolean) => {
  if (condition) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`); }
};

const booking = {
  holdId: "00000000-0000-4000-8000-000000000001",
  customerName: "A Passenger",
  customerPhone: "9876543210",
  paymentType: "CASH",
  seats: [{
    seatId: "00000000-0000-4000-8000-000000000002",
    fare: "125.50",
    extraPersonCount: 1,
    extraPersonCharge: "50.00",
    gender: "F",
  }],
};

console.log("\x1b[1mBooking input validation\x1b[0m");
const valid = confirmBookingSchema.safeParse(booking);
check("valid booking and optional passenger gender are accepted", valid.success);
check("seat charges are converted to paise",
  valid.success && valid.data.seats[0].fare === 12550 &&
    valid.data.seats[0].extraPersonCharge === 5000);
const separateSofaExtras = confirmBookingSchema.safeParse({
  ...booking,
  seats: [
    { ...booking.seats[0], extraPersonCount: 2, extraPersonCharge: "30.00" },
    {
      ...booking.seats[0],
      seatId: "00000000-0000-4000-8000-000000000003",
      extraPersonCount: 3,
      extraPersonCharge: "50.00",
    },
  ],
});
check("single and double sofa extra people can have different counts and rates",
  separateSofaExtras.success &&
    separateSofaExtras.data.seats[0].extraPersonCount === 2 &&
    separateSofaExtras.data.seats[0].extraPersonCharge === 3000 &&
    separateSofaExtras.data.seats[1].extraPersonCount === 3 &&
    separateSofaExtras.data.seats[1].extraPersonCharge === 5000);
check("valid 10-digit mobile number is accepted",
  confirmBookingSchema.safeParse({
    ...booking, customerPhone: "9876543210",
  }).success);
check("short phone number is rejected",
  !confirmBookingSchema.safeParse({ ...booking, customerPhone: "987654321" }).success);
check("11-digit phone number is rejected",
  !confirmBookingSchema.safeParse({ ...booking, customerPhone: "91987654321" }).success);
check("country code and formatted phone numbers are rejected",
  !confirmBookingSchema.safeParse({ ...booking, customerPhone: "+91 98765 43210" }).success);
check("mobile numbers not starting from 6 to 9 are rejected",
  !confirmBookingSchema.safeParse({ ...booking, customerPhone: "5123456789" }).success);
check("non-numeric phone number is rejected",
  !confirmBookingSchema.safeParse({ ...booking, customerPhone: "abcdefghij" }).success);
check("invalid optional alternate phone is rejected",
  !confirmBookingSchema.safeParse({ ...booking, altPhone: "12345" }).success);
check("optional reservation phone accepts an empty value or valid mobile number",
  holdSeatsSchema.safeParse({
    tripId: booking.holdId, seatIds: [booking.seats[0].seatId],
    provisionalPhone: "9876543210",
  }).success && holdSeatsSchema.safeParse({
    tripId: booking.holdId, seatIds: [booking.seats[0].seatId],
    provisionalPhone: "",
  }).success);
check("invalid reservation phone is rejected",
  !holdSeatsSchema.safeParse({
    tripId: booking.holdId, seatIds: [booking.seats[0].seatId],
    provisionalPhone: "1234567",
  }).success);
check("currency with more than two decimal places is rejected",
  !confirmBookingSchema.safeParse({
    ...booking, seats: [{ ...booking.seats[0], fare: "12.345" }],
  }).success);
check("malformed currency is rejected",
  !confirmBookingSchema.safeParse({
    ...booking, seats: [{ ...booking.seats[0], fare: "not a price" }],
  }).success);
check("extra-person count above the configured maximum is rejected",
  !confirmBookingSchema.safeParse({
    ...booking, seats: [{ ...booking.seats[0], extraPersonCount: 21 }],
  }).success);
check("seat changes require at least one valid seat",
  !updateHoldSeatsSchema.safeParse({
    holdId: booking.holdId, seatIds: [],
  }).success);
check("schedule generation accepts a selected weekday filter",
  generateTripsSchema.safeParse({
    fromDate: "2025-05-05", toDate: "2025-05-11", daysOfWeek: [1, 3, 5],
  }).success);
check("schedule generation rejects invalid weekdays",
  !generateTripsSchema.safeParse({
    fromDate: "2025-05-05", toDate: "2025-05-11", daysOfWeek: [7],
  }).success);
check("schedule generation requires at least one selected weekday",
  !generateTripsSchema.safeParse({
    fromDate: "2025-05-05", toDate: "2025-05-11", daysOfWeek: [],
  }).success);

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
