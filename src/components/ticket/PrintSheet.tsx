"use client";

import { Children, useState } from "react";
import { Download, Printer } from "lucide-react";

export type PrintFormat =
  | "a4-8up" | "a4-4up" | "a4-3up" | "a4-3cut" | "a4-3upmemo" | "a4-3cutmemo" | "a5" | "a5-memo" | "thermal";

export const COMPACT_FORMATS: PrintFormat[] = ["a4-8up", "a4-4up"];

const FORMATS: {
  id: PrintFormat; label: string; perPage: string; hint: string;
}[] = [
  { id: "a4-8up", label: "A4 · 8 per page", perPage: "8",
    hint: "Two columns, four rows. Most tickets per sheet." },
  { id: "a4-4up", label: "A4 · 4 per page", perPage: "4",
    hint: "Full-width strips, roomier to read and tear." },
  { id: "a4-3up", label: "A4 · 3 per page", perPage: "3",
    hint: "Three roomy tickets with a small gap between each." },
  { id: "a4-3cut", label: "A4/3 cut sheet · 1 ticket per page", perPage: "1",
    hint: "One ticket sized for pre-cut A4/3 paper (210 × 99 mm)." },
  { id: "a4-3upmemo", label: "A4 · 3 per page + memo", perPage: "3",
    hint: "Three roomy ticket-and-memo sections with small gaps." },
  { id: "a4-3cutmemo", label: "A4/3 cut sheet · ticket + memo", perPage: "1",
    hint: "One ticket and memo sized for pre-cut A4/3 paper (210 × 99 mm)." },
  { id: "a5", label: "A5 · 1 per page", perPage: "1",
    hint: "One ticket with the full berth breakdown." },
  { id: "a5-memo", label: "A5 · ticket + office memo", perPage: "1",
    hint: "Landscape A5 with a detachable office memo." },
  { id: "thermal", label: "Thermal 80mm", perPage: "1",
    hint: "Counter receipt printer." },
];

const PER_PAGE: Record<PrintFormat, number> = {
  "a4-8up": 8, "a4-4up": 4, "a4-3up": 3, "a4-3cut": 1, "a4-3upmemo": 3, "a4-3cutmemo": 1,
  a5: 1, "a5-memo": 1, thermal: 1,
};

/**
 * Wraps tickets in the sheet that the print stylesheet targets.
 *
 * The format is a data attribute rather than JS-generated styles so the
 * page-break rules stay in the stylesheet, where the browser's print engine
 * can actually apply them.
 */
export function PrintSheet({
  children, count, subtitle, defaultFormat = "a4-8up", onFormatChange,
  downloadFileName, backInstructions, backNotesOnly = false,
}: {
  children: React.ReactNode;
  count: number;
  subtitle: string;
  defaultFormat?: PrintFormat;
  onFormatChange?: (f: PrintFormat) => void;
  downloadFileName?: string;
  backInstructions?: string;
  backNotesOnly?: boolean;
}) {
  const [format, setFormat] = useState<PrintFormat>(defaultFormat);
  const [printSide] = useState<"front" | "back">(backNotesOnly ? "back" : "front");
  const [flipEdge, setFlipEdge] = useState<"long" | "short">("long");
  const sheets = Math.ceil(count / PER_PAGE[format]);
  const ticketNodes = Children.toArray(children);
  const selectedFormat = FORMATS.find((item) => item.id === format);
  const hasMemo = format === "a4-3upmemo" || format === "a4-3cutmemo" || format === "a5-memo";
  const unitsPerSheet = PER_PAGE[format];
  const unitLabel = backNotesOnly ? "note copies" : "tickets";
  const pageGuidance = format === "a4-3cut" || format === "a4-3cutmemo"
    ? `Use custom paper sized 210 × 99 mm (A4 divided into thirds), portrait, at 100% scale. The app builds in a 3 mm margin on every side; set print-dialog Pages per sheet to 1 and margins to None.`
    : format.startsWith("a4")
    ? `Use A4 portrait at 100% scale. The app places ${unitsPerSheet} ${unitLabel} on each sheet and builds in a 3 mm margin on every side; set print-dialog Pages per sheet to 1 and margins to None.`
    : format.startsWith("a5")
    ? `Use ${format === "a5-memo" ? "A5 landscape" : "A5 portrait"} at 100% scale. The app builds in a 3 mm margin on every side; set print-dialog Pages per sheet to 1 and margins to None.`
    : "Set receipt paper width to 80 mm.";

  function openPrintDialog(asPdf: boolean) {
    const originalTitle = document.title;
    if (asPdf) {
      document.title = backNotesOnly
        ? `ticket-back-notes-${count}-copies`
        : downloadFileName ?? originalTitle;
    }
    try {
      window.print();
    } finally {
      document.title = originalTitle;
    }
  }

  function pick(f: PrintFormat) {
    setFormat(f);
    onFormatChange?.(f);
  }

  function renderBackNote(index: number) {
    return (
      <article key={index} className={`ticket back-ticket${hasMemo ? " back-ticket-with-memo" : ""}`}
        aria-label={`Backside note for ticket ${index + 1}`}>
        <div className="back-instruction-content">
          <strong className="back-instruction-heading">મુસાફરીની નોંધ</strong>
          <p>{backInstructions}</p>
          <span className="back-ticket-number">{index + 1} / {count}</span>
        </div>
        {hasMemo && (
          <div className="back-memo-blank">
            <span className="no-print">મેમો બાજુ ખાલી રાખો</span>
          </div>
        )}
      </article>
    );
  }

  function renderTicketPage(pageIndex: number) {
    const start = pageIndex * PER_PAGE[format];
    return (
      <div key={pageIndex} className="ticket-print-page">
        {ticketNodes.slice(start, start + PER_PAGE[format])}
      </div>
    );
  }

  function renderBackNotePage(pageIndex: number) {
    const start = pageIndex * PER_PAGE[format];
    return (
      <div key={pageIndex} className="back-note-page">
        {Array.from(
          { length: Math.min(PER_PAGE[format], count - start) },
          (_, copyIndex) => renderBackNote(start + copyIndex),
        )}
      </div>
    );
  }

  return (
    <>
      <section className="no-print mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-ink-900">
                {backNotesOnly ? "Batch ticket back notes" : "Ticket front"}
              </h2>
              <span className="text-xs text-ink-500">
                {count} {backNotesOnly
                  ? count === 1 ? "note copy" : "note copies"
                  : count === 1 ? "ticket" : "tickets"} · {sheets} {sheets === 1 ? "sheet" : "sheets"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-500">{subtitle}</p>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
            Paper
            <select value={format} onChange={(event) => pick(event.target.value as PrintFormat)}
              className="h-10 min-w-52 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              <optgroup label="A4 paper">
                {FORMATS.filter((item) => item.id.startsWith("a4")).map((item) =>
                  <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
              <optgroup label="A5 paper">
                {FORMATS.filter((item) => item.id.startsWith("a5")).map((item) =>
                  <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
              <optgroup label="Receipt paper">
                {FORMATS.filter((item) => item.id === "thermal").map((item) =>
                  <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
            </select>
          </label>

          {backNotesOnly && (
            <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
              Refeed
              <select value={flipEdge} onChange={(event) => setFlipEdge(event.target.value as "long" | "short")}
                className="h-10 rounded-lg border border-ink-200 bg-white px-2.5 text-sm font-medium text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value="long">Flip long edge</option>
                <option value="short">Flip short edge</option>
              </select>
            </label>
          )}

          {backNotesOnly && (
            <button type="button" onClick={() => openPrintDialog(true)}
              title="Open the print dialog and choose Save as PDF"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-600 bg-white px-4 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              <Download size={16} /> Save as PDF
            </button>
          )}
          <button type="button" onClick={() => openPrintDialog(false)}
            title={printSide === "back"
              ? "Print only the ticket back notes"
              : downloadFileName
              ? `Choose Save as PDF to download ${downloadFileName}.pdf`
              : undefined}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {printSide === "back"
              ? <><Printer size={16} /> Print back notes</>
              : downloadFileName
              ? <><Download size={16} /> Download ticket</>
              : <><Printer size={16} /> Print tickets</>}
          </button>
        </div>
        <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-500">
          {printSide === "back"
            ? `This page prints only the requested note copies, not ticket fronts. ${pageGuidance} Keep scale at 100% and turn off headers and footers. Print the tickets separately, then refeed those sheets ${flipEdge === "long" ? "by turning each sheet over its long edge" : "by turning each sheet over its short edge"}. ${hasMemo ? "The memo side remains blank; use the preview cut line to align the notes behind the ticket." : "Check one sample sheet to confirm the printer feed direction."}`
            : `${selectedFormat?.hint ?? ""} `}
          {printSide === "front" && `${pageGuidance} Keep Pages per sheet at 1 and turn off headers and footers.`}
          {printSide === "front" && downloadFileName && <> Save as PDF as <strong className="font-semibold text-ink-700">{downloadFileName}.pdf</strong>.</>}
        </p>
      </section>

      <section className="no-print mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">{printSide === "front" ? "Ticket preview" : "Backside alignment demo"}</h2>
          <p className="text-xs text-ink-500">
            {printSide === "back" && hasMemo
              ? `${flipEdge === "long" ? "Long-edge" : "Short-edge"} refeed alignment is shown; the reverse of the memo panel is kept blank.`
              : "Preview follows the selected paper format."}
          </p>
        </div>
        <span className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-500">
          {format.startsWith("a4") ? "A4" : format.startsWith("a5") ? "A5" : "80 mm"} · {unitsPerSheet} {backNotesOnly ? "notes" : "tickets"} / sheet
        </span>
      </section>
      <div className="print-sheet mx-auto flex w-full flex-col items-center gap-3"
        data-print-format={format} data-print-side={printSide} data-flip-edge={flipEdge}>
        {printSide === "front"
          ? format === "thermal"
            ? children
            : Array.from({ length: sheets }, (_, pageIndex) => renderTicketPage(pageIndex))
          : format === "thermal"
          ? Array.from({ length: count }, (_, index) => renderBackNote(index))
          : Array.from({ length: sheets }, (_, pageIndex) => renderBackNotePage(pageIndex))}
      </div>
    </>
  );
}
