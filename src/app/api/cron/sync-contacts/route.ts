import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { importContactsForAccount } from "@/lib/contacts/import";

export const maxDuration = 300;

export async function GET(req: Request) {
  // Vercel Cron sends an Authorization: Bearer <CRON_SECRET> header.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: accounts } = await admin
    .from("email_accounts")
    .select("id")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(20);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const a of accounts || []) {
    try {
      await importContactsForAccount(a.id);
      results.push({ id: a.id, ok: true });
    } catch (e) {
      results.push({ id: a.id, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
