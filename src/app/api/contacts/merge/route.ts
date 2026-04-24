import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Merge `sourceId` into `targetId`. The source contact is deleted; its emails
// and interactions are reassigned to the target.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceId, targetId } = await req.json();
  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  // Re-parent
  await sb
    .from("contact_emails")
    .update({ contact_id: targetId, is_primary: false })
    .eq("contact_id", sourceId)
    .eq("user_id", user.id);
  await sb
    .from("contact_interactions")
    .update({ contact_id: targetId })
    .eq("contact_id", sourceId)
    .eq("user_id", user.id);

  await sb.from("contacts").delete().eq("id", sourceId).eq("user_id", user.id);

  // Recompute aggregates for target
  const { count } = await sb
    .from("contact_interactions")
    .select("*", { count: "exact", head: true })
    .eq("contact_id", targetId);
  const { data: latest } = await sb
    .from("contact_interactions")
    .select("occurred_at")
    .eq("contact_id", targetId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .single();
  await sb
    .from("contacts")
    .update({
      interaction_count: count || 0,
      last_interaction_at: latest?.occurred_at || null,
    })
    .eq("id", targetId);

  return NextResponse.json({ ok: true });
}
