import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { GMAIL_SCOPES, gmailOAuthClient } from "@/lib/oauth/gmail";

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);

  const url = new URL(req.url);
  const hintedEmail = url.searchParams.get("email") || undefined;

  const state = crypto.randomBytes(24).toString("hex");
  await sb.from("oauth_states").insert({
    state,
    user_id: user.id,
    provider: "google",
  });

  const oauth = gmailOAuthClient();
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
    login_hint: hintedEmail,
  });
  return NextResponse.redirect(authUrl);
}
