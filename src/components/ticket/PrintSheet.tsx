"use client";

import { useState } from "react";
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
  { id: "a4-3cut", label: "A4 · 3 cut sections", perPage: "3",
    hint: "Three equal ticket sections with cut guides." },
  { id: "a4-3upmemo", label: "A4 · 3 per page + memo", perPage: "3",
    hint: "Three roomy ticket-and-memo sections with small gaps." },
  { id: "a4-3cutmemo", label: "A4 · 3 cut sections + memo", perPage: "3",
    hint: "Three equal ticket-and-memo sections with cut guides." },
  { id: "a5", label: "A5 · 1 per page", perPage: "1",
    hint: "One ticket with the full berth breakdown." },
  { id: "a5-memo", label: "A5 · ticket + office memo", perPage: "1",
    hint: "Landscape A5 with a detachable office memo." },
  { id: "thermal", label: "Thermal 80mm", perPage: "1",
    hint: "Counter receipt printer." },
];

const PER_PAGE: Record<PrintFormat, number> = {
  "a4-8up": 8, "a4-4up": 4, "a4-3up": 3, "a4-3cut": 3, "a4-3upmemo": 3, "a4-3cutmemo": 3,
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
  downloadFileName,
}: {
  children: React.ReactNode;
  count: number;
  subtitle: string;
  defaultFormat?: PrintFormat;
  onFormatChange?: (f: PrintFormat) => void;
  downloadFileName?: string;
}) {
  const [format, setFormat] = useState<PrintFormat>(defaultFormat);
  const sheets = Math.ceil(count / PER_PAGE[format]);

  function pick(f: PrintFormat) {
    setFormat(f);
    onFormatChange?.(f);
  }

  return (
    <>
      <section className="no-print mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-ink-900">Print ticket</h2>
              <span className="text-xs text-ink-500">
                {count} {count === 1 ? "ticket" : "tickets"} · {sheets} {sheets === 1 ? "sheet" : "sheets"}
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

          <button type="button" onClick={() => window.print()}
            title={downloadFileName
              ? `Choose Save as PDF to download ${downloadFileName}.pdf`
              : undefined}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {downloadFileName
              ? <><Download size={16} /> Download ticket</>
              : <><Printer size={16} /> Print tickets</>}
          </button>
        </div>
        <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-500">
          {FORMATS.find((item) => item.id === format)?.hint}{" "}
          {format === "a4-3up" || format === "a4-3cut" || format === "a4-3upmemo" || format === "a4-3cutmemo"
            ? "Use A4 portrait at 100% scale."
            : format === "a5-memo"
            ? "Use A5 landscape at 100% scale."
            : format.startsWith("a4")
            ? "Use A4 portrait."
            : format === "a5"
            ? "Choose A5 paper, or A4 with scaling."
            : "Set receipt paper width to 80 mm."}
          {downloadFileName && <> Save as PDF as <strong className="font-semibold text-ink-700">{downloadFileName}.pdf</strong>.</>}
        </p>
      </section>

      <section className="no-print mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Ticket preview</h2>
          <p className="text-xs text-ink-500">Preview updates to match the selected print format.</p>
        </div>
        <span className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-500">
          {format.startsWith("a4") ? "A4" : format.startsWith("a5") ? "A5" : "80 mm"} · {FORMATS.find((f) => f.id === format)?.perPage} per page
        </span>
      </section>
      <div className="print-sheet mx-auto flex w-full flex-col items-center gap-3"
        data-print-format={format}>
        {children}
      </div>
    </>
  );
}
