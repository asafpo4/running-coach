"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncStravaButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Sync failed. Try again in a bit.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <button
        onClick={sync}
        disabled={syncing}
        className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
      >
        {syncing ? "Syncing…" : "Sync Strava"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
