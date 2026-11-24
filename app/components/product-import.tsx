"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { previewImportAction, runImportAction, type ImportResult, type PlannedRow } from "@/app/actions/product-import";
import { TEMPLATE_HEADER } from "@/app/lib/product-import";

const SAMPLE_ROWS = [
  ["Claw hammer 16oz", "HM-16", "", "Hand tools", "pcs", "850", "1200", "1100", "0", "12", "3"],
  ["PVC pipe 1 inch", "PVC-1", "", "Plumbing", "m", "95", "140", "", "0", "250.5", "50"],
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADER, ...SAMPLE_ROWS].map((r) => r.join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "products-template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel saves "CSV UTF-8" or, with plain "CSV", the Windows code page; try UTF-8 first. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const STATUS_STYLE: Record<PlannedRow["status"], string> = {
  new: "bg-emerald-50 text-emerald-700",
  update: "bg-sky-50 text-sky-700",
  error: "bg-red-50 text-red-700",
};

export function ProductImport({ currency }: { currency: string }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const content = await readText(file);
      setFileName(file.name);
      setText(content);
      setShowErrorsOnly(false);
      setResult(await previewImportAction(content));
    });
  };

  const rows = result && "rows" in result ? result.rows : [];
  const count = (s: PlannedRow["status"]) => rows.filter((r) => r.status === s).length;
  const done = result && "done" in result && result.done;
  const ready = count("new") + count("update");
  const shown = (showErrorsOnly ? rows.filter((r) => r.status === "error") : rows).slice(0, 300);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">1. Prepare the file</h2>
          <p className="mt-1 text-sm text-zinc-600">
            One product per line, with a header line naming the columns. <strong>Name</strong> and{" "}
            <strong>Sale price</strong> are required; the rest are optional. In Excel use{" "}
            <em>File → Save As → CSV UTF-8</em>.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-500">
            <li>A line whose SKU or barcode is already in the catalog updates that product (name, prices, category); its stock is left alone, and blank cells keep the old value.</li>
            <li>New products get the Opening stock as their starting stock. Missing categories are created.</li>
            <li>Units: pcs, box, kg, ltr, m, yard, cft, hr. Blank means pcs.</li>
          </ul>
          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <DownloadIcon className="h-4 w-4" /> Download template
          </button>
        </div>

        <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">2. Choose the file</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0]);
            }}
            className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 transition hover:border-brand-600 hover:text-brand-700 disabled:opacity-60"
          >
            <FileSpreadsheetIcon className="h-6 w-6" />
            {pending && !done ? "Reading…" : fileName || "Click or drop a .csv file"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {result && "error" in result && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      )}

      {done && "created" in result! && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <p className="font-semibold">
            Imported: {result.created} new product{result.created === 1 ? "" : "s"}, {result.updated} updated.
          </p>
          {count("error") > 0 && <p className="mt-1">{count("error")} line(s) with errors were skipped; fix them and import the file again.</p>}
          <div className="mt-3 flex gap-3">
            <Link href="/products" className="font-medium text-emerald-800 underline">
              Open products
            </Link>
            <Link href="/labels" className="font-medium text-emerald-800 underline">
              Print barcode labels
            </Link>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-zinc-900">3. Check and import</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{count("new")} new</span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{count("update")} update</span>
              {count("error") > 0 && (
                <button
                  type="button"
                  onClick={() => setShowErrorsOnly((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${showErrorsOnly ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}
                >
                  {count("error")} with errors {showErrorsOnly ? "· show all" : "· show only these"}
                </button>
              )}
            </div>
            {!done && (
              <button
                type="button"
                disabled={pending || ready === 0}
                onClick={() =>
                  start(async () => {
                    setResult(await runImportAction(text!));
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadIcon className="h-4 w-4" />
                {pending ? "Importing…" : `Import ${ready} product${ready === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
          {count("error") > 0 && !done && (
            <p className="border-b border-zinc-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
              Lines with errors are skipped. Fix them in the file and import it again; lines already imported will just update.
            </p>
          )}
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50">
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Line</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Opening stock</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {shown.map((r) => (
                  <tr key={r.line} className={r.status === "error" ? "bg-red-50/40" : ""}>
                    <td className="px-4 py-2 text-zinc-400 tabular-nums">{r.line}</td>
                    <td className="px-4 py-2">
                      <span className="text-zinc-900">{r.name || <span className="text-zinc-400">(no name)</span>}</span>
                      {r.errors.length > 0 && <span className="block text-xs text-red-700">{r.errors.join(" · ")}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-700">
                      {r.price !== undefined ? `${currency} ${r.price.toLocaleString("en-PK", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-700">
                      {r.status === "update" ? <span className="text-zinc-400">unchanged</span> : (r.stockQty ?? "—")}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {r.status === "new" ? "New" : r.status === "update" ? "Update" : "Error"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(showErrorsOnly ? count("error") : rows.length) > shown.length && (
              <p className="px-5 py-3 text-xs text-zinc-400">Showing the first {shown.length} lines.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
