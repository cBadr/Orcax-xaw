import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { testBoth } from "@/lib/imap/test";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { email, display_name, password, imap, smtp } = body;

  if (!email || !password || !imap || !smtp) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const result = await testBoth({ email, password, imap, smtp });
  if (!result.imap.ok || !result.smtp.ok) {
    return NextResponse.json(
      { error: "Verification failed", result },
      { status: 400 },
    );
  }

  const { data, error } = await sb
    .from("email_accounts")
    .insert({
      user_id: user.id,
      email,
      display_name: display_name || null,
      auth_kind: "imap_password",
      imap_host: imap.host,
      imap_port: imap.port,
      imap_secure: imap.secure,
      smtp_host: smtp.host,
      smtp_port: smtp.port,
      smtp_secure: smtp.secure,
      password_enc: encrypt(password),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ account: data });
}
