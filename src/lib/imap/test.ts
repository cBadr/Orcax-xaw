import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

export type ImapSmtpCreds = {
  email: string;
  password: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
};

export async function testImap(c: ImapSmtpCreds): Promise<void> {
  const client = new ImapFlow({
    host: c.imap.host,
    port: c.imap.port,
    secure: c.imap.secure,
    auth: { user: c.email, pass: c.password },
    logger: false,
    socketTimeout: 10_000,
  });
  await client.connect();
  await client.logout();
}

export async function testSmtp(c: ImapSmtpCreds): Promise<void> {
  const transport = nodemailer.createTransport({
    host: c.smtp.host,
    port: c.smtp.port,
    secure: c.smtp.secure,
    auth: { user: c.email, pass: c.password },
    connectionTimeout: 10_000,
  });
  await transport.verify();
}

export async function testBoth(c: ImapSmtpCreds): Promise<{
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}> {
  const results = await Promise.all([
    testImap(c).then(
      () => ({ ok: true as const }),
      (e: Error) => ({ ok: false as const, error: e.message }),
    ),
    testSmtp(c).then(
      () => ({ ok: true as const }),
      (e: Error) => ({ ok: false as const, error: e.message }),
    ),
  ]);
  return { imap: results[0], smtp: results[1] };
}
