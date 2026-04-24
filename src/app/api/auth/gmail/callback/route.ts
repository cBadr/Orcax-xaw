import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { gmailOAuthClient } from "@/lib/oauth/gmail";
import { encrypt } from "@/lib/crypto";
import { google } from "googleapis";

export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/accounts/new?error=${encodeURIComponent(err)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/accounts/new?error=missing_code`);
  }

  // Verify state
  const { data: stateRow } = await sb
    .from("oauth_states")
    .select("state")
    .eq("state", state)
    .eq("user_id", user.id)
    .single();
  if (!stateRow) {
    return NextResponse.redirect(`${appUrl}/accounts/new?error=bad_state`);
  }
  await sb.from("oauth_states").delete().eq("state", state);

  const oauth = gmailOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // Fetch the user's email
  const oauth2 = google.oauth2({ version: "v2", auth: oauth });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email;
  if (!email) {
    return NextResponse.redirect(`${appUrl}/accounts/new?error=no_email`);
  }

  const { error: upsertErr } = await sb.from("email_accounts").upsert(
    {
      user_id: user.id,
      email,
      auth_kind: "oauth_google",
      access_token_enc: tokens.access_token ? encrypt(tokens.access_token) : null,
      refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      oauth_scope: tokens.scope || null,
    },
    { onConflict: "user_id,email" },
  );

  if (upsertErr) {
    return NextResponse.redirect(
      `${appUrl}/accounts/new?error=${encodeURIComponent(upsertErr.message)}`,
    );
  }
  return NextResponse.redirect(`${appUrl}/accounts`);
}
