"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ServerCfg = { host: string; port: number; secure: boolean };

export default function AddAccountForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "configure">("email");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [imap, setImap] = useState<ServerCfg>({ host: "", port: 993, secure: true });
  const [smtp, setSmtp] = useState<ServerCfg>({ host: "", port: 465, secure: true });
  const [provider, setProvider] = useState<"gmail" | "outlook" | "imap" | null>(null);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    imap: { ok: boolean; error?: string };
    smtp: { ok: boolean; error?: string };
  } | null>(null);

  async function detectProvider(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const domain = email.split("@")[1]?.toLowerCase();
      if (domain === "gmail.com" || domain === "googlemail.com") {
        setProvider("gmail");
      } else if (
        domain === "outlook.com" ||
        domain === "hotmail.com" ||
        domain === "live.com" ||
        domain?.endsWith(".onmicrosoft.com")
      ) {
        setProvider("outlook");
      } else {
        setProvider("imap");
        const res = await fetch("/api/accounts/autoconfig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setImap(data.imap);
        setSmtp(data.smtp);
        setDetectedSource(data.source);
      }
      setStep("configure");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setError(null);
    setTestResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/test-imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, imap, smtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAccount() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName,
          password,
          imap,
          smtp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  function startOAuth(p: "gmail" | "outlook") {
    window.location.href = `/api/auth/${p}/start?email=${encodeURIComponent(email)}`;
  }

  if (step === "email") {
    return (
      <form onSubmit={detectProvider} className="card p-6 space-y-4">
        <div>
          <label className="label">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label">Display name (optional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
            placeholder="Work — Sales"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Detecting..." : "Continue"}
        </button>
      </form>
    );
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">Email</div>
          <div className="font-medium">{email}</div>
        </div>
        <button
          onClick={() => {
            setStep("email");
            setTestResult(null);
            setError(null);
          }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Change
        </button>
      </div>

      {provider === "gmail" && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="text-sm font-medium">Gmail detected</div>
          <p className="text-sm text-slate-600">
            Recommended: connect via Google OAuth (most secure, no password stored).
          </p>
          <button onClick={() => startOAuth("gmail")} className="btn-primary">
            Connect with Google
          </button>
        </div>
      )}

      {provider === "outlook" && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <div className="text-sm font-medium">Microsoft account detected</div>
          <p className="text-sm text-slate-600">
            Recommended: connect via Microsoft OAuth.
          </p>
          <button onClick={() => startOAuth("outlook")} className="btn-primary">
            Connect with Microsoft
          </button>
        </div>
      )}

      {provider === "imap" && (
        <>
          {detectedSource && (
            <div className="text-xs text-slate-500">
              Settings source: <span className="font-mono">{detectedSource}</span>
              {detectedSource === "guess" && " — please verify below"}
            </div>
          )}

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="IMAP password or app password"
            />
          </div>

          <fieldset className="rounded-md border border-slate-200 p-4 space-y-3">
            <legend className="text-sm font-semibold px-1">IMAP (incoming)</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Host</label>
                <input
                  className="input"
                  value={imap.host}
                  onChange={(e) => setImap({ ...imap, host: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Port</label>
                <input
                  type="number"
                  className="input"
                  value={imap.port}
                  onChange={(e) =>
                    setImap({ ...imap, port: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={imap.secure}
                onChange={(e) => setImap({ ...imap, secure: e.target.checked })}
              />
              Use SSL/TLS
            </label>
          </fieldset>

          <fieldset className="rounded-md border border-slate-200 p-4 space-y-3">
            <legend className="text-sm font-semibold px-1">SMTP (outgoing)</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Host</label>
                <input
                  className="input"
                  value={smtp.host}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Port</label>
                <input
                  type="number"
                  className="input"
                  value={smtp.port}
                  onChange={(e) =>
                    setSmtp({ ...smtp, port: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={smtp.secure}
                onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
              />
              Use SSL/TLS
            </label>
          </fieldset>

          {testResult && (
            <div className="space-y-1 text-sm">
              <div className={testResult.imap.ok ? "text-green-700" : "text-red-600"}>
                IMAP: {testResult.imap.ok ? "✓ OK" : `✗ ${testResult.imap.error}`}
              </div>
              <div className={testResult.smtp.ok ? "text-green-700" : "text-red-600"}>
                SMTP: {testResult.smtp.ok ? "✓ OK" : `✗ ${testResult.smtp.error}`}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={testConnection}
              disabled={loading || !password}
              className="btn-secondary"
            >
              {loading ? "Testing..." : "Test connection"}
            </button>
            <button
              onClick={saveAccount}
              disabled={
                loading ||
                !password ||
                !testResult ||
                !testResult.imap.ok ||
                !testResult.smtp.ok
              }
              className="btn-primary"
            >
              {loading ? "Saving..." : "Save account"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
