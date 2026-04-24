// Auto-detect IMAP/SMTP settings for a given email domain.
// Strategy:
//   1. Known providers table (fast path).
//   2. Mozilla ISP database: https://autoconfig.thunderbird.net/v1.1/<domain>
//   3. Domain's own autoconfig: https://autoconfig.<domain>/mail/config-v1.1.xml
//   4. Heuristic guesses: imap.<domain> / mail.<domain>

export type ServerConfig = {
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  source: "known" | "mozilla" | "domain-autoconfig" | "guess";
};

const KNOWN: Record<string, ServerConfig> = {
  "gmail.com": {
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    source: "known",
  },
  "outlook.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    source: "known",
  },
  "hotmail.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    source: "known",
  },
  "yahoo.com": {
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    source: "known",
  },
  "zoho.com": {
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    source: "known",
  },
  "icloud.com": {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    source: "known",
  },
};

function parseXml(xml: string): ServerConfig | null {
  // Minimal XML extraction — we don't ship a full parser.
  const imap = /<incomingServer[^>]*type="imap"[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>(\d+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>/.exec(
    xml,
  );
  const smtp = /<outgoingServer[^>]*type="smtp"[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>(\d+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>/.exec(
    xml,
  );
  if (!imap || !smtp) return null;
  return {
    imap: {
      host: imap[1],
      port: parseInt(imap[2], 10),
      secure: imap[3] === "SSL",
    },
    smtp: {
      host: smtp[1],
      port: parseInt(smtp[2], 10),
      secure: smtp[3] === "SSL",
    },
    source: "mozilla",
  };
}

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function autoconfig(email: string): Promise<ServerConfig> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) throw new Error("Invalid email");

  if (KNOWN[domain]) return KNOWN[domain];

  // Mozilla ISP DB
  const mozilla = await tryFetch(
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
  );
  if (mozilla) {
    const parsed = parseXml(mozilla);
    if (parsed) return parsed;
  }

  // Domain's own autoconfig
  const own = await tryFetch(
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`,
  );
  if (own) {
    const parsed = parseXml(own);
    if (parsed) return { ...parsed, source: "domain-autoconfig" };
  }

  // Fallback: heuristic guess
  return {
    imap: { host: `imap.${domain}`, port: 993, secure: true },
    smtp: { host: `smtp.${domain}`, port: 465, secure: true },
    source: "guess",
  };
}
