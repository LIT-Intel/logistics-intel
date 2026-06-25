/**
 * QuotePdfPreview — right-column panel for generating + previewing the quote PDF.
 *
 * Generating the PDF is owned by the parent (QuoteBuilder), which renders it
 * client-side, uploads it via `quote-generate-pdf`, and hands back the signed
 * URL. This component is purely presentational: it triggers the parent's
 * generate handler and, once a signed URL exists, lets the user open it.
 */
import { FileDown, ExternalLink, Loader2, FileText } from "lucide-react";

export interface QuotePdfPreviewProps {
  generating: boolean;
  signedUrl?: string | null;
  onGenerate: () => void;
}

export default function QuotePdfPreview({ generating, signedUrl, onGenerate }: QuotePdfPreviewProps) {
  const hasPdf = Boolean(signedUrl);

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[13px] font-bold text-slate-900">Quote PDF</h3>
        {hasPdf && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            Ready
          </span>
        )}
      </div>

      {/* Thumbnail / placeholder */}
      <div className="mt-3 grid h-32 place-items-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50">
        {generating ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[12px]">Generating…</span>
          </div>
        ) : hasPdf ? (
          <div className="flex flex-col items-center gap-1.5 text-slate-500">
            <FileText className="h-7 w-7 text-blue-500" />
            <span className="text-[12px] font-medium">Branded quote PDF generated</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-400">
            <FileText className="h-7 w-7" />
            <span className="text-[12px]">No PDF yet</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] px-3 font-display text-[12.5px] font-semibold text-white transition disabled:opacity-60"
          style={{ background: "linear-gradient(180deg,#0891b2,#0e7490)" }}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          {hasPdf ? "Regenerate" : "Generate PDF"}
        </button>
        {hasPdf && (
          <a
            href={signedUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-slate-200 bg-white px-3 font-display text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Preview
          </a>
        )}
      </div>
    </section>
  );
}
