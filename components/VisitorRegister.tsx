"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ResultCard from "@/components/ResultCard";
import VisitorForm from "@/components/VisitorForm";
import VisitorPicker from "@/components/VisitorPicker";
import type { ScanResult } from "@/lib/types";
import { ScanIcon } from "@/components/Icons";

type Props = { sessionUuid: string };

export default function VisitorRegister({ sessionUuid }: Props) {
  const router = useRouter();
  const [manualEntry, setManualEntry] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Back to the scanner page; the camera only starts once that page mounts.
  const backToScanner = useCallback(() => {
    router.push("/");
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
      <header className="flex items-center justify-between py-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ScanIcon className="h-4.5 w-4.5" />
            </span>
            Register visitor
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">Camera is off while you register</p>
        </div>
      </header>

      {result ? (
        <ResultCard result={result} onScanAgain={backToScanner} />
      ) : manualEntry ? (
        <VisitorForm
          sessionUuid={sessionUuid}
          onDone={setResult}
          onCancel={backToScanner}
        />
      ) : (
        <VisitorPicker
          sessionUuid={sessionUuid}
          onDone={setResult}
          onManual={() => setManualEntry(true)}
          onCancel={backToScanner}
        />
      )}
    </div>
  );
}
