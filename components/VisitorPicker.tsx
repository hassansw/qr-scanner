"use client";

import { useMemo, useState } from "react";
import { extractMessage, submitVisitor } from "@/lib/scanApi";
import { VISITOR_PRESETS } from "@/lib/presets";
import type { ScanResult, VisitorFormData } from "@/lib/types";
import { CheckIcon, ScanIcon, XIcon } from "@/components/Icons";

type Props = {
  sessionUuid: string;
  selected: number;
  onSelect: (index: number) => void;
  onDone: (result: ScanResult) => void;
  onCancel: () => void;
};

export default function VisitorPicker({
  sessionUuid,
  selected,
  onSelect,
  onDone,
  onCancel,
}: Props) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = VISITOR_PRESETS.map((preset, index) => ({ preset, index }));
    if (!needle) return rows;
    return rows.filter(
      ({ preset }) =>
        preset.name.toLowerCase().includes(needle) ||
        preset.company_name.toLowerCase().includes(needle) ||
        preset.email.toLowerCase().includes(needle)
    );
  }, [query]);

  const send = async () => {
    if (submitting) return;
    const preset = VISITOR_PRESETS[selected];
    if (!preset) return;

    setSubmitting(true);
    const payload: VisitorFormData = { ...preset, session_uuid: sessionUuid };

    try {
      const res = await submitVisitor(payload);
      onDone({
        code: sessionUuid,
        status: res.ok ? "success" : "error",
        message: extractMessage(res.data, res.ok),
        timestamp: Date.now(),
        payload,
      });
    } catch {
      onDone({
        code: sessionUuid,
        status: "error",
        message: "Network error while submitting the visitor.",
        timestamp: Date.now(),
        payload,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-up rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-zinc-100">Choose a visitor</h2>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            Session <span className="font-mono text-zinc-300">{sessionUuid}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Cancel and scan again"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 disabled:opacity-50"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name, company or email"
        aria-label="Filter visitors"
        className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-500"
      />

      <ul
        role="radiogroup"
        aria-label="Preset visitor records"
        className="no-scrollbar mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
      >
        {filtered.length === 0 && (
          <li className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-4 text-center text-xs text-zinc-500">
            No visitor matches that filter.
          </li>
        )}
        {filtered.map(({ preset, index }) => {
          const isSelected = index === selected;
          return (
            <li key={preset.email}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(index)}
                disabled={submitting}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                      : "border-zinc-600"
                  }`}
                >
                  {isSelected && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">
                    {preset.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {preset.company_name}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                  {preset.visitortype}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* <div className="mt-4">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
          Payload to send
        </p>
        <pre className="no-scrollbar mt-2 max-h-44 overflow-auto rounded-xl border border-zinc-700/70 bg-black/30 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300">
          {JSON.stringify(
            { ...VISITOR_PRESETS[selected], session_uuid: sessionUuid },
            null,
            2
          )}
        </pre>
      </div> */}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={submitting}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
              Sending…
            </>
          ) : (
            <>
              <ScanIcon className="h-4 w-4" />
              Send selected
            </>
          )}
        </button>
      </div>
    </div>
  );
}
