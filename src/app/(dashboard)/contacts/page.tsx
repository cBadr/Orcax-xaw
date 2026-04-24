import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import ContactsSearch from "@/components/ContactsSearch";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const sb = await supabaseServer();

  let query = sb
    .from("contacts")
    .select("id, display_name, primary_email, company, tags, interaction_count, last_interaction_at")
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (q) {
    query = query.or(
      `display_name.ilike.%${q}%,primary_email.ilike.%${q}%,company.ilike.%${q}%`,
    );
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data: contacts } = await query;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Link href="/contacts?new=1" className="btn-primary hidden">+ Add</Link>
      </div>

      <ContactsSearch initialQ={q || ""} />

      {(!contacts || contacts.length === 0) ? (
        <div className="card p-10 text-center text-slate-500">
          No contacts yet. Add an email account — Orcax will import everyone you've corresponded with.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Interactions</th>
                <th className="px-4 py-3">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-slate-900 hover:text-brand">
                      {c.display_name || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.primary_email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.company || ""}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags || []).map((t) => (
                        <span key={t} className="text-xs bg-slate-100 rounded px-2 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.interaction_count}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString() : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
