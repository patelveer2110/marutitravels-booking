"use client";

import { useState } from "react";
import { PrintSheet } from "@/components/ticket/PrintSheet";

const MAX_NOTE_COPIES = 500;

export function BackNotesBatchPrint({ backInstructions }: { backInstructions: string }) {
  const [copiesInput, setCopiesInput] = useState("1");
  const copies = Number(copiesInput);
  const validCopies = /^\d+$/.test(copiesInput)
    && copies >= 1
    && copies <= MAX_NOTE_COPIES;

  return (
    <>
      <section className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-700">
          Number of back-note copies
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_NOTE_COPIES}
            step={1}
            required
            value={copiesInput}
            onChange={(event) => setCopiesInput(event.target.value)}
            aria-invalid={!validCopies}
            aria-describedby="back-note-copy-help"
            className="h-10 w-44 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <p id="back-note-copy-help" className="pb-2 text-xs text-ink-500">
          Enter 1–{MAX_NOTE_COPIES} copies. Select the same paper format used for the ticket fronts.
        </p>
      </section>
      {validCopies && (
        <PrintSheet
          count={copies}
          subtitle="Back notes print as a separate pass; ticket fronts are not included."
          backInstructions={backInstructions}
          backNotesOnly
        >
          {null}
        </PrintSheet>
      )}
      {!validCopies && (
        <p className="no-print text-sm text-red-700" role="alert">
          Enter a whole number from 1 to {MAX_NOTE_COPIES} to preview and print.
        </p>
      )}
    </>
  );
}
