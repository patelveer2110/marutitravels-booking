import assert from "node:assert/strict";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { styledExcelWorkbook } from "../../src/lib/excel";

async function main() {
  const columns = [
    "PNR", "Booked", "Name", "Phone", "Seats", "Single extra", "Double extra",
    "Bus", "Bus no.", "Pay type", "Payment", "Status", "Total", "Paid",
    "Pickup", "Drop",
  ];
  assert.ok(columns.every((heading) => heading.trim().split(/\s+/).length <= 2));

  const bytes = await styledExcelWorkbook(
    "Passenger manifest",
    columns,
    [
      ["PNR001", "10 Oct 2026, 10:00 am", "Paid passenger", "9999999999", "1A", "—", "—",
        "Bus 1", "BUS001", "CASH", "PAID", "CONFIRMED", "100.00", "100.00",
        "Stop A", "Stop B"],
      ["PNR002", "10 Oct 2026, 10:05 am", "Unpaid passenger", "9888888888",
        "2A", "1 person · 10.00", "—", "Bus 1", "BUS001", "PENDING", "UNPAID",
        "CONFIRMED", "110.00", "0.00",
        "Stop A", "Stop B"],
    ],
    [1],
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from([bytes]));
  const sheet = workbook.getWorksheet("Manifest");
  const fillColor = (cell: ExcelJS.Cell) =>
    cell.fill.type === "pattern" ? cell.fill.fgColor?.argb : undefined;

  assert.ok(sheet);
  assert.equal(sheet.getCell("A4").value, "PNR001");
  assert.equal(sheet.getCell("A5").value, "PNR002");
  assert.equal(sheet.getCell("B5").value, "10 Oct 2026, 10:05 am");
  assert.equal(sheet.getCell("E5").value, "2A");
  assert.equal(sheet.getCell("K5").value, "UNPAID");
  assert.equal(fillColor(sheet.getCell("A4")), undefined);
  assert.equal(fillColor(sheet.getCell("A5")), "FFFEF3C7");
  assert.equal(fillColor(sheet.getCell("K5")), "FFFDE68A");
  assert.equal(sheet.getCell("K5").font.bold, true);
  assert.equal(sheet.pageSetup.blackAndWhite, true);

  console.log("Manifest workbook styles and grayscale print mode passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
