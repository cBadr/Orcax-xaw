import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { outlookAuthUrl } from "@/lib/oauth/outlook";

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);

  const url = new URL(req.url);
  const hinted = url.searchParams.get("email") || undefined;

  const state = crypto.randomBytes(24).toString("hex");
  await sb.from("oauth_states").insert({
    state,
    user_id: user.id,
    provider: "microsoft",
  });
  return NextResponse.redirect(outlookAuthUrl(state, hinted));
}
