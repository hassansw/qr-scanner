"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { extractMessage, submitVisitor } from "@/lib/scanApi";
import type { ScanResult, VisitorFormData } from "@/lib/types";
import { RefreshIcon, ScanIcon, XIcon } from "@/components/Icons";

const VISITOR_TYPES = ["CUSTOMER", "SUPPLIER", "EMPLOYEE", "VENDOR", "GUEST"];

type Props = {
  sessionUuid: string;
  onDone: (result: ScanResult) => void;
  onCancel: () => void;
};

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-500 disabled:opacity-50";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export default function VisitorForm({ sessionUuid, onDone, onCancel }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [visitortype, setVisitortype] = useState("CUSTOMER");
  const [isExisting, setIsExisting] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const payload: VisitorFormData = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      visitortype,
      is_existing: isExisting,
      company_name: companyName.trim(),
      website: website.trim() || undefined,
      session_uuid: sessionUuid,
    };

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
        message: "Network error while submitting the visitor form.",
        timestamp: Date.now(),
        payload,
      });
    }
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="animate-fade-up rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-100">Visitor registration</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Session{" "}
            <span className="font-mono text-zinc-300">{sessionUuid}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel and scan again"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-300 transition hover:border-zinc-500"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3.5">
        <Field label="Full name">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Faizan Khalid"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="faizan@example.com"
              inputMode="email"
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              placeholder="+923310212344"
              inputMode="tel"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Visitor type">
            <select
              value={visitortype}
              onChange={(event) => setVisitortype(event.target.value)}
              className={inputClass}
            >
              {VISITOR_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Existing visitor?">
            <select
              value={isExisting ? "yes" : "no"}
              onChange={(event) => setIsExisting(event.target.value === "yes")}
              className={inputClass}
            >
              <option value="no">No (new visitor)</option>
              <option value="yes">Yes (existing visitor)</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Company name">
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
              placeholder="PSO"
              className={inputClass}
            />
          </Field>
          <Field label="Website (optional)">
            <input
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://psopk.com"
              inputMode="url"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
              Submitting…
            </>
          ) : (
            <>
              <ScanIcon className="h-4 w-4" />
              Submit visitor
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshIcon className="h-4 w-4" />
          Scan again
        </button>
      </div>
    </form>
  );
}
