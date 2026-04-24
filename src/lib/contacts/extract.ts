// Utilities for extracting / normalising contacts from email headers.

export type RawAddress = { name?: string; address: string };

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const [local, domain] = e.split("@");
  if (!domain) return e;
  // Strip +tags (gmail style). Dots inside the local part are kept — don't
  // silently merge identities we can't prove are the same person.
  const cleanLocal = local.split("+")[0];
  return `${cleanLocal}@${domain}`;
}

/** Parse "Name <email>" / bare email / multiple comma-separated entries. */
export function parseAddressList(raw: string | undefined | null): RawAddress[] {
  if (!raw) return [];
  const out: RawAddress[] = [];
  // Very lenient parser; mailparser gives us structured data in practice,
  // this is the fallback for raw strings.
  const parts = raw.split(/,(?![^<]*>)/);
  for (const p of parts) {
    const m = p.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || p.match(/^\s*([^\s<>@]+@[^\s<>]+)\s*$/);
    if (!m) continue;
    if (m.length === 3) out.push({ name: m[1]?.trim() || undefined, address: m[2].trim() });
    else out.push({ address: m[1].trim() });
  }
  return out;
}

export function dedupeAddresses(list: RawAddress[]): RawAddress[] {
  const seen = new Map<string, RawAddress>();
  for (const a of list) {
    const key = normalizeEmail(a.address);
    if (!seen.has(key)) seen.set(key, { ...a, address: key });
    else if (a.name && !seen.get(key)!.name) seen.set(key, { ...a, address: key });
  }
  return [...seen.values()];
}
