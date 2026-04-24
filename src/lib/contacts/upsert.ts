import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, type RawAddress } from "./extract";

export type InteractionRow = {
  account_id: string;
  message_uid: string | null;
  folder: string | null;
  subject: string | null;
  direction: "incoming" | "outgoing";
  occurred_at: string; // ISO
  address: RawAddress;
};

/**
 * Upsert contacts + emails + interactions in a single batch.
 * Behaviour:
 *  - If an address is new → create a contact with that address as primary.
 *  - If the address exists → find its contact; if the new row carries a name
 *    AND the current display_name is empty or different, update to the latest.
 *  - interaction_count / last_interaction_at are maintained.
 */
export async function ingestInteractions(
  sb: SupabaseClient,
  userId: string,
  rows: InteractionRow[],
) {
  if (rows.length === 0) return { contactsTouched: 0, interactionsInserted: 0 };

  // Collect unique addresses
  const unique = new Map<string, RawAddress>();
  for (const r of rows) {
    const addr = normalizeEmail(r.address.address);
    const existing = unique.get(addr);
    if (!existing || (r.address.name && !existing.name)) {
      unique.set(addr, { ...r.address, address: addr });
    }
  }
  const addresses = [...unique.keys()];

  // Fetch existing contact_email rows
  const { data: existing } = await sb
    .from("contact_emails")
    .select("email, contact_id")
    .eq("user_id", userId)
    .in("email", addresses);

  const emailToContact = new Map<string, string>();
  (existing || []).forEach((e) => emailToContact.set(e.email, e.contact_id));

  // Create missing contacts
  const missing = addresses.filter((a) => !emailToContact.has(a));
  if (missing.length > 0) {
    const newContacts = missing.map((addr) => ({
      user_id: userId,
      primary_email: addr,
      display_name: unique.get(addr)?.name || null,
    }));
    const { data: inserted, error } = await sb
      .from("contacts")
      .insert(newContacts)
      .select("id, primary_email");
    if (error) throw error;
    const emailLinks = (inserted || []).map((c) => ({
      contact_id: c.id,
      user_id: userId,
      email: c.primary_email,
      is_primary: true,
    }));
    if (emailLinks.length > 0) {
      const { error: linkErr } = await sb.from("contact_emails").insert(emailLinks);
      if (linkErr) throw linkErr;
    }
    (inserted || []).forEach((c) => emailToContact.set(c.primary_email!, c.id));
  }

  // Refresh names: if incoming address has a name that differs, update contact.display_name.
  // (User chose: "update to latest" on name conflict.)
  const nameUpdates: Array<{ id: string; display_name: string }> = [];
  for (const [addr, info] of unique) {
    if (!info.name) continue;
    const cid = emailToContact.get(addr);
    if (!cid) continue;
    nameUpdates.push({ id: cid, display_name: info.name });
  }
  // Update in parallel batches (Supabase doesn't support multi-row different-value updates easily)
  await Promise.all(
    nameUpdates.map((u) =>
      sb
        .from("contacts")
        .update({ display_name: u.display_name })
        .eq("id", u.id)
        .eq("user_id", userId),
    ),
  );

  // Insert interactions
  const interactionRows = rows.map((r) => ({
    user_id: userId,
    contact_id: emailToContact.get(normalizeEmail(r.address.address))!,
    account_id: r.account_id,
    message_uid: r.message_uid,
    folder: r.folder,
    subject: r.subject,
    direction: r.direction,
    occurred_at: r.occurred_at,
  }));
  const { error: iErr } = await sb.from("contact_interactions").insert(interactionRows);
  if (iErr) throw iErr;

  // Update contact aggregates (last_interaction_at + interaction_count)
  const contactIds = [...new Set(interactionRows.map((r) => r.contact_id))];
  await Promise.all(
    contactIds.map(async (cid) => {
      const { count } = await sb
        .from("contact_interactions")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", cid);
      const { data: latest } = await sb
        .from("contact_interactions")
        .select("occurred_at")
        .eq("contact_id", cid)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .single();
      await sb
        .from("contacts")
        .update({
          interaction_count: count || 0,
          last_interaction_at: latest?.occurred_at || null,
        })
        .eq("id", cid);
    }),
  );

  return {
    contactsTouched: emailToContact.size,
    interactionsInserted: interactionRows.length,
  };
}
