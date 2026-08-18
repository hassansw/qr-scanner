"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/types";
import {
  CheckIcon,
  CopyIcon,
  ExternalIcon,
  RefreshIcon,
  ScanIcon,
  XIcon,
} from "@/components/Icons";

type Props = {
  result: ScanResult;
  onScanAgain: () => void;
  onRetry?: () => void;
};

export default function ResultCard({ result, onScanAgain, onRetry }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const isSuccess = result.status === "success";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const copyPayload = async () => {
    if (!result.payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.payload, null, 2));
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const isUrl = /^https?:\/\//i.test(result.code);
  const hasPayload = result.payload !== undefined;

  return (
    <div
      className={`animate-fade-up rounded-2xl border p-5 shadow-lg shadow-black/30 ${
        isSuccess
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            isSuccess
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {isSuccess ? <CheckIcon className="h-6 w-6" /> : <XIcon className="h-6 w-6" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-wide uppercase text-zinc-400">
            {isSuccess ? "Registered" : "Failed"}
          </p>
          <p
            className={`mt-0.5 text-lg font-bold break-all ${
              isSuccess ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {result.message}
          </p>
        </div>
      </div>

      {result.code && (
        <div className="mt-4 rounded-xl border border-zinc-700/70 bg-black/30 p-3.5">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
            Session UUID
          </p>
          <p className="mt-1 font-mono text-sm break-all text-zinc-200">{result.code}</p>
        </div>
      )}

      {hasPayload && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
              Submitted payload
            </p>
            <button
              type="button"
              onClick={copyPayload}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copiedPayload ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="no-scrollbar mt-2 max-h-56 overflow-auto rounded-xl border border-zinc-700/70 bg-black/30 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300">
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onScanAgain}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 transition hover:bg-white"
        >
          <ScanIcon className="h-4 w-4" />
          Scan again
        </button>
        {!isSuccess && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
          >
            <RefreshIcon className="h-4 w-4" />
            Retry API
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
        >
          <CopyIcon className="h-4 w-4" />
          {copied ? "Copied" : "Copy UUID"}
        </button>
        {isUrl && (
          <a
            href={result.code}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
          >
            <ExternalIcon className="h-4 w-4" />
            Open
          </a>
        )}
      </div>
    </div>
  );
}