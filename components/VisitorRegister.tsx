"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ResultCard from "@/components/ResultCard";
import VisitorForm from "@/components/VisitorForm";
import VisitorPicker from "@/components/VisitorPicker";
import { VISITOR_PRESETS } from "@/lib/presets";
import type { ScanResult } from "@/lib/types";
import { ScanIcon } from "@/components/Icons";

type Props = { sessionUuid: string };
type Mode = "preset" | "manual";

export default function VisitorRegister({ sessionUuid }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("preset");
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Back to the scanner page; the camera only starts once that page mounts.
  const backToScanner = useCallback(() => {
    router.push("/");
  }, [router]);

  const tabClass = (active: boolean) =>
    `h-9 flex-1 rounded-lg px-3 text-xs font-semibold transition ${
      active ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
      <header className="py-5">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <ScanIcon className="h-4.5 w-4.5" />
          </span>
          Register visitor
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">Camera is off while you register</p>
      </header>

      {result ? (
        <ResultCard result={result} onScanAgain={backToScanner} />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Registration mode"
            className="mb-3 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preset"}
              onClick={() => setMode("preset")}
              className={tabClass(mode === "preset")}
            >
              Prefilled record
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "manual"}
              onClick={() => setMode("manual")}
              className={tabClass(mode === "manual")}
            >
              Manual entry
            </button>
          </div>

          {mode === "preset" ? (
            <VisitorPicker
              sessionUuid={sessionUuid}
              selected={selected}
              onSelect={setSelected}
              onDone={setResult}
              onCancel={backToScanner}
            />
          ) : (
            // Re-seed the fields whenever a different record is picked.
            <VisitorForm
              key={selected}
              sessionUuid={sessionUuid}
              initial={VISITOR_PRESETS[selected]}
              onDone={setResult}
              onCancel={backToScanner}
            />
          )}
        </>
      )}
    </div>
  );
}
