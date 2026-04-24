"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sync}
        disabled={loading}
        className="btn-secondary !py-1 !px-3 text-xs"
      >
        {loading ? "Syncing..." : "Sync now"}
      </button>
      {error && <div className="text-xs text-red-600 max-w-[200px] text-right">{error}</div>}
    </div>
  );
}
