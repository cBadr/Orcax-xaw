import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import SyncButton from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const sb = await supabaseServer();
  const { data: accounts } = await sb
    .from("email_accounts")
    .select("id, email, display_name, auth_kind, initial_import_done, last_sync_at, sync_error")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Accounts</h1>
        <Link href="/accounts/new" className="btn-primary">
          + Add account
        </Link>
      </div>

      {(!accounts || accounts.length === 0) ? (
        <div className="card p-10 text-center text-slate-500">
          No email accounts yet. Add your first one to get started.
        </div>
      ) : (
        <div className="card divide-y divide-slate-200">
          {accounts.map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{a.email}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {a.auth_kind} · {a.initial_import_done ? "Imported" : "Pending initial import"}
                  {a.last_sync_at && ` · last sync ${new Date(a.last_sync_at).toLocaleString()}`}
                </div>
                {a.sync_error && (
                  <div className="text-xs text-red-600 mt-1">⚠ {a.sync_error}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {a.display_name && (
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {a.display_name}
                  </span>
                )}
                <SyncButton accountId={a.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
