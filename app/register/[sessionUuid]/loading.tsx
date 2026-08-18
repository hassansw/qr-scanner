export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
        <header className="py-5">
          <div className="h-6 w-44 animate-pulse rounded-lg bg-zinc-800" />
          <div className="mt-2 h-3 w-56 animate-pulse rounded bg-zinc-900" />
        </header>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-zinc-700 border-t-emerald-400" />
          <p className="text-sm text-zinc-400">Loading visitor records…</p>
        </div>
      </div>
    </main>
  );
}
