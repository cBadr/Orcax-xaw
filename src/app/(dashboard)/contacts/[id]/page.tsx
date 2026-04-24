import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import ContactEditor from "@/components/ContactEditor";

export const dynamic = "force-dynamic";

export default async function ContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: contact } = await sb
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (!contact) notFound();

  const { data: emails } = await sb
    .from("contact_emails")
    .select("id, email, is_primary")
    .eq("contact_id", id);

  const { data: interactions } = await sb
    .from("contact_interactions")
    .select("id, subject, direction, occurred_at, folder, account_id")
    .eq("contact_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <Link href="/contacts" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to contacts
      </Link>

      <ContactEditor
        contact={contact}
        emails={emails || []}
      />

      <section>
        <h2 className="text-lg font-semibold mb-3">Timeline</h2>
        {(!interactions || interactions.length === 0) ? (
          <div className="card p-6 text-slate-500 text-sm">No interactions yet.</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {interactions.map((i) => (
              <div key={i.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "inline-flex w-16 justify-center rounded-full px-2 py-0.5 text-xs font-medium " +
                      (i.direction === "incoming"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-sky-50 text-sky-700")
                    }
                  >
                    {i.direction === "incoming" ? "in" : "out"}
                  </span>
                  <span className="font-medium">{i.subject || "(no subject)"}</span>
                  {i.folder && (
                    <span className="text-xs text-slate-400">{i.folder}</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(i.occurred_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
