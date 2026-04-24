import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { testBoth } from "@/lib/imap/test";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { email, password, imap, smtp } = body;
  if (!email || !password || !imap || !smtp) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const result = await testBoth({ email, password, imap, smtp });
  return NextResponse.json(result);
}
