export const OUTLOOK_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Contacts.Read",
];

export function outlookAuthUrl(state: string, loginHint?: string): string {
  const tenant = process.env.MICROSOFT_TENANT || "common";
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeOutlookCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const tenant = process.env.MICROSOFT_TENANT || "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`,
        grant_type: "authorization_code",
        scope: OUTLOOK_SCOPES.join(" "),
      }),
    },
  );
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function fetchOutlookProfile(accessToken: string): Promise<{
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Outlook profile");
  return res.json();
}
