import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { exchangeOutlookCode, fetchOutlookProfile } from "@/lib/oauth/outlook";

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

  try {
    const tokens = await exchangeOutlookCode(code);
    const profile = await fetchOutlookProfile(tokens.access_token);
    const email = profile.mail || profile.userPrincipalName;
    if (!email) throw new Error("No email returned from Microsoft profile");

    const { error: upsertErr } = await sb.from("email_accounts").upsert(
      {
        user_id: user.id,
        email,
        display_name: profile.displayName || null,
        auth_kind: "oauth_microsoft",
        access_token_enc: encrypt(tokens.access_token),
        refresh_token_enc: encrypt(tokens.refresh_token),
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
      },
      { onConflict: "user_id,email" },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.redirect(`${appUrl}/accounts`);
  } catch (e) {
    return NextResponse.redirect(
      `${appUrl}/accounts/new?error=${encodeURIComponent((e as Error).message)}`,
    );
  }
}
