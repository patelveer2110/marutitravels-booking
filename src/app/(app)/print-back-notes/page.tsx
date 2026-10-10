import Link from "next/link";
import { Printer } from "lucide-react";
import { getOfficeDetails } from "@/lib/office";
import { BackNotesBatchPrint } from "./BackNotesBatchPrint";

export const dynamic = "force-dynamic";

export default async function PrintBackNotesPage() {
  const office = await getOfficeDetails();

  return (
    <div className="p-4 sm:p-6">
      <header className="no-print mb-5">
        <div className="mb-2 flex items-center gap-2 text-brand-700">
          <Printer size={18} />
          <span className="text-xs font-semibold uppercase tracking-wide">Batch printing</span>
        </div>
        <h1 className="text-xl font-semibold text-ink-900">Print ticket back notes</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">
          Choose how many backs to print. This prints notes only, separately from the ticket fronts.
          Use the same paper format and quantity as the front batch, then test one sheet to confirm
          your printer’s refeed direction.
        </p>
      </header>
      {office.backInstructions.trim() ? (
        <BackNotesBatchPrint backInstructions={office.backInstructions} />
      ) : (
        <section className="no-print rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">No back note configured</h2>
          <p className="mt-1 text-sm text-amber-800">
            Add the Gujarati ticket-back note in Office details before printing.
          </p>
          <Link href="/office-settings"
            className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">
            Open Office details
          </Link>
        </section>
      )}
    </div>
  );
}
