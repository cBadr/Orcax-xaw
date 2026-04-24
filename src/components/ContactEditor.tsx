"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Contact = {
  id: string;
  display_name: string | null;
  primary_email: string | null;
  company: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
};

type ContactEmail = { id: string; email: string; is_primary: boolean };

export default function ContactEditor({
  contact,
  emails,
}: {
  contact: Contact;
  emails: ContactEmail[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(contact);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const sb = supabaseBrowser();
    await sb
      .from("contacts")
      .update({
        display_name: form.display_name,
        company: form.company,
        phone: form.phone,
        notes: form.notes,
        tags: form.tags,
      })
      .eq("id", contact.id);
    setSaving(false);
    router.refresh();
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  }

  return (
    <div className="card p-6 grid md:grid-cols-2 gap-5">
      <div>
        <label className="label">Display name</label>
        <input
          className="input"
          value={form.display_name || ""}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Primary email</label>
        <input className="input bg-slate-100" value={form.primary_email || ""} readOnly />
      </div>
      <div>
        <label className="label">Company</label>
        <input
          className="input"
          value={form.company || ""}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Phone</label>
        <input
          className="input"
          value={form.phone || ""}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>

      <div className="md:col-span-2">
        <label className="label">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.tags.map((t) => (
            <span
              key={t}
              className="text-xs bg-slate-100 rounded-full px-3 py-1 flex items-center gap-1"
            >
              {t}
              <button
                onClick={() =>
                  setForm({ ...form, tags: form.tags.filter((x) => x !== t) })
                }
                className="text-slate-400 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Add tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button onClick={addTag} className="btn-secondary">Add</button>
        </div>
      </div>

      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <textarea
          rows={4}
          className="input"
          value={form.notes || ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="md:col-span-2">
        <label className="label">All known addresses</label>
        <div className="text-sm text-slate-600 space-y-1">
          {emails.map((e) => (
            <div key={e.id}>
              {e.email}
              {e.is_primary && (
                <span className="ml-2 text-xs text-brand">primary</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
