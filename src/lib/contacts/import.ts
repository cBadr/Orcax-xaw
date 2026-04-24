import { ImapFlow, type FetchMessageObject } from "imapflow";
import { decrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ingestInteractions, type InteractionRow } from "./upsert";
import type { RawAddress } from "./extract";

type DbAccount = {
  id: string;
  user_id: string;
  email: string;
  auth_kind: "oauth_google" | "oauth_microsoft" | "imap_password";
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  password_enc: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  initial_import_done: boolean;
  last_sync_at: string | null;
};

/** Run an import for an account. Full scan on first run, incremental after. */
export async function importContactsForAccount(accountId: string) {
  const admin = supabaseAdmin();
  const { data: acc, error } = await admin
    .from("email_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (error || !acc) throw new Error("Account not found");
  const account = acc as DbAccount;

  try {
    switch (account.auth_kind) {
      case "imap_password":
        await importViaImap(account);
        break;
      case "oauth_google":
        await importViaGmail(account);
        break;
      case "oauth_microsoft":
        await importViaGraph(account);
        break;
    }
    await admin
      .from("email_accounts")
      .update({
        initial_import_done: true,
        last_sync_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", accountId);
  } catch (e) {
    await admin
      .from("email_accounts")
      .update({ sync_error: (e as Error).message })
      .eq("id", accountId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// IMAP
// ---------------------------------------------------------------------------
async function importViaImap(account: DbAccount) {
  if (!account.password_enc || !account.imap_host) {
    throw new Error("IMAP account missing credentials");
  }
  const password = decrypt(account.password_enc);
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: account.imap_secure ?? true,
    auth: { user: account.email, pass: password },
    logger: false,
  });
  await client.connect();

  const since = account.initial_import_done && account.last_sync_at
    ? new Date(account.last_sync_at)
    : undefined; // undefined → fetch all on initial import

  const admin = supabaseAdmin();
  try {
    const mailboxes = await client.list();
    for (const box of mailboxes) {
      if (box.flags?.has("\\Noselect")) continue;
      await processMailbox(client, box.path, account, since, admin);
    }
  } finally {
    await client.logout();
  }
}

async function processMailbox(
  client: ImapFlow,
  path: string,
  account: DbAccount,
  since: Date | undefined,
  admin: ReturnType<typeof supabaseAdmin>,
) {
  const lock = await client.getMailboxLock(path);
  try {
    const search = since ? { since } : { all: true };
    const rows: InteractionRow[] = [];
    for await (const msg of client.fetch(search, {
      envelope: true,
      uid: true,
      internalDate: true,
    }) as AsyncIterable<FetchMessageObject>) {
      const env = msg.envelope;
      if (!env) continue;
      const occurredAt = (env.date || msg.internalDate || new Date()).toISOString();
      const subject = env.subject || null;

      const fromList: RawAddress[] = (env.from || []).map((a) => ({
        name: a.name || undefined,
        address: a.address || "",
      })).filter((a) => a.address);

      const toList: RawAddress[] = [
        ...(env.to || []),
        ...(env.cc || []),
        ...(env.bcc || []),
      ]
        .map((a) => ({ name: a.name || undefined, address: a.address || "" }))
        .filter((a) => a.address);

      const isOutgoing =
        fromList.some((a) => a.address.toLowerCase() === account.email.toLowerCase());

      if (isOutgoing) {
        for (const addr of toList) {
          rows.push({
            account_id: account.id,
            message_uid: String(msg.uid),
            folder: path,
            subject,
            direction: "outgoing",
            occurred_at: occurredAt,
            address: addr,
          });
        }
      } else {
        for (const addr of fromList) {
          rows.push({
            account_id: account.id,
            message_uid: String(msg.uid),
            folder: path,
            subject,
            direction: "incoming",
            occurred_at: occurredAt,
            address: addr,
          });
        }
      }

      if (rows.length >= 500) {
        await ingestInteractions(admin, account.user_id, rows.splice(0, rows.length));
      }
    }
    if (rows.length > 0) {
      await ingestInteractions(admin, account.user_id, rows);
    }
  } finally {
    lock.release();
  }
}

// ---------------------------------------------------------------------------
// Gmail (Google API)
// ---------------------------------------------------------------------------
async function importViaGmail(account: DbAccount) {
  const { google } = await import("googleapis");
  const { gmailOAuthClient } = await import("@/lib/oauth/gmail");

  const oauth = gmailOAuthClient();
  oauth.setCredentials({
    access_token: account.access_token_enc ? decrypt(account.access_token_enc) : undefined,
    refresh_token: account.refresh_token_enc ? decrypt(account.refresh_token_enc) : undefined,
    expiry_date: account.token_expires_at
      ? new Date(account.token_expires_at).getTime()
      : undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth });
  const admin = supabaseAdmin();

  const query = account.initial_import_done && account.last_sync_at
    ? `after:${Math.floor(new Date(account.last_sync_at).getTime() / 1000)}`
    : "";

  let pageToken: string | undefined;
  const rows: InteractionRow[] = [];

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 500,
      pageToken,
    });
    pageToken = list.data.nextPageToken || undefined;
    const ids = list.data.messages || [];

    for (const { id } of ids) {
      if (!id) continue;
      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
      });
      const headers = msg.data.payload?.headers || [];
      const h = (name: string) =>
        headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || "";
      const occurredAt = new Date(parseInt(msg.data.internalDate || "0", 10)).toISOString();
      const subject = h("Subject") || null;
      const labels = msg.data.labelIds || [];
      const isOutgoing = labels.includes("SENT");

      const { parseAddressList } = await import("./extract");
      if (isOutgoing) {
        const recips = [
          ...parseAddressList(h("To")),
          ...parseAddressList(h("Cc")),
          ...parseAddressList(h("Bcc")),
        ];
        for (const addr of recips) {
          rows.push({
            account_id: account.id,
            message_uid: id,
            folder: "SENT",
            subject,
            direction: "outgoing",
            occurred_at: occurredAt,
            address: addr,
          });
        }
      } else {
        for (const addr of parseAddressList(h("From"))) {
          rows.push({
            account_id: account.id,
            message_uid: id,
            folder: labels.join(","),
            subject,
            direction: "incoming",
            occurred_at: occurredAt,
            address: addr,
          });
        }
      }

      if (rows.length >= 500) {
        await ingestInteractions(admin, account.user_id, rows.splice(0, rows.length));
      }
    }
  } while (pageToken);

  if (rows.length > 0) await ingestInteractions(admin, account.user_id, rows);
}

// ---------------------------------------------------------------------------
// Microsoft Graph (Outlook)
// ---------------------------------------------------------------------------
async function importViaGraph(account: DbAccount) {
  if (!account.access_token_enc) throw new Error("Missing Outlook access token");
  const token = decrypt(account.access_token_enc);
  const admin = supabaseAdmin();
  const rows: InteractionRow[] = [];

  const since = account.initial_import_done && account.last_sync_at
    ? `&$filter=receivedDateTime ge ${new Date(account.last_sync_at).toISOString()}`
    : "";

  let url: string | null =
    `https://graph.microsoft.com/v1.0/me/messages?$select=from,toRecipients,ccRecipients,bccRecipients,subject,receivedDateTime,sentDateTime,sender,isDraft&$top=200${since}`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Graph fetch failed: ${await res.text()}`);
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        from?: { emailAddress: { address: string; name?: string } };
        toRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
        ccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
        bccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
        subject?: string;
        receivedDateTime?: string;
        sentDateTime?: string;
      }>;
      "@odata.nextLink"?: string;
    };
    url = data["@odata.nextLink"] || null;

    for (const m of data.value) {
      const fromAddr = m.from?.emailAddress.address?.toLowerCase();
      const isOutgoing = fromAddr === account.email.toLowerCase();
      const occurredAt = m.receivedDateTime || m.sentDateTime || new Date().toISOString();
      const subject = m.subject || null;

      if (isOutgoing) {
        const recips = [
          ...(m.toRecipients || []),
          ...(m.ccRecipients || []),
          ...(m.bccRecipients || []),
        ];
        for (const r of recips) {
          rows.push({
            account_id: account.id,
            message_uid: m.id,
            folder: "SENT",
            subject,
            direction: "outgoing",
            occurred_at: occurredAt,
            address: {
              name: r.emailAddress.name,
              address: r.emailAddress.address,
            },
          });
        }
      } else if (m.from) {
        rows.push({
          account_id: account.id,
          message_uid: m.id,
          folder: "INBOX",
          subject,
          direction: "incoming",
          occurred_at: occurredAt,
          address: {
            name: m.from.emailAddress.name,
            address: m.from.emailAddress.address,
          },
        });
      }

      if (rows.length >= 500) {
        await ingestInteractions(admin, account.user_id, rows.splice(0, rows.length));
      }
    }
  }

  if (rows.length > 0) await ingestInteractions(admin, account.user_id, rows);
}
