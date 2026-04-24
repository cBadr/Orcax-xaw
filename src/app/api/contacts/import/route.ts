import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { importContactsForAccount } from "@/lib/contacts/import";

export const maxDuration = 300; // 5 minutes on Vercel Pro; adjust as needed.

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = await req.json();
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  // RLS will protect the select; just double-check ownership.
  const { data: acc } = await sb
    .from("email_accounts")
    .select("id")
    .eq("id", accountId)
    .single();
  if (!acc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await importContactsForAccount(accountId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
