import ExcelJS from "exceljs";

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function excelWorkbook(title: string, columns: string[], rows: unknown[][]): string {
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(new Date());

  const lines = [
    [title],
    [`Generated ${generatedAt} · ${rows.length} record${rows.length === 1 ? "" : "s"}`],
    columns,
    ...rows,
  ].map((line) => line.map((cell) => escapeCsv(cell)).join(",")).join("\r\n");

  return `\uFEFF${lines}`;
}

export async function styledExcelWorkbook(
  title: string,
  columns: string[],
  rows: unknown[][],
  highlightedRows: number[] = [],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Manifest", {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      blackAndWhite: true,
    },
  });
  worksheet.columns = columns.map((header, index) => ({
    key: `column${index}`,
    width: Math.min(36, Math.max(14, header.length + 2)),
  }));

  const titleRow = worksheet.addRow([title]);
  worksheet.mergeCells(1, 1, 1, columns.length);
  titleRow.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  titleRow.alignment = { vertical: "middle" };
  titleRow.height = 26;

  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(new Date());
  const generatedRow = worksheet.addRow([
    `Generated ${generatedAt} · ${rows.length} record${rows.length === 1 ? "" : "s"}`,
  ]);
  worksheet.mergeCells(2, 1, 2, columns.length);
  generatedRow.font = { italic: true, color: { argb: "FF475569" } };

  const headerRow = worksheet.addRow(columns);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 32;
  worksheet.views = [{ state: "frozen", ySplit: 3 }];
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: columns.length },
  };

  const paymentStatusColumn = columns.indexOf("Payment") + 1
    || columns.indexOf("Payment status") + 1;
  const highlightSet = new Set(highlightedRows);
  rows.forEach((values, index) => {
    const row = worksheet.addRow(values.map((value) =>
      typeof value === "number" || typeof value === "string" ? value : String(value ?? "")));
    row.alignment = { vertical: "middle", wrapText: true };
    if (highlightSet.has(index)) {
      row.font = { bold: true, color: { argb: "FF422006" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      row.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
      };
      if (paymentStatusColumn > 0) {
        const paymentStatusCell = row.getCell(paymentStatusColumn);
        paymentStatusCell.font = { bold: true, color: { argb: "FF422006" } };
        paymentStatusCell.fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" },
        };
        paymentStatusCell.border = {
          top: { style: "medium", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "medium", color: { argb: "FF000000" } },
        };
        paymentStatusCell.alignment = { vertical: "middle", wrapText: true };
      }
    }
  });

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export function moneyPaise(value: number): string {
  return (value / 100).toFixed(2);
}
