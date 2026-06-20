import { useEffect, useRef, useState } from "react";
import { Provider, postJSON, streamRun, logout } from "../api.js";
import { ProviderIcon } from "../components/ProviderIcon.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { Modal } from "../components/Modal.js";
import { useToast } from "../components/Toast.js";

interface Props {
  providers: Provider[];
  refresh: () => Promise<Provider[]>;
  /** Authoritative re-check (launches a hidden browser per provider). */
  verify: () => Promise<void>;
  /** Per-provider "real check in progress" flags. */
  checking: Record<string, boolean>;
}

type LoginStatus = "opening" | "waiting" | "done" | "error";

interface LoginState {
  providerId: string;
  status: LoginStatus;
  message?: string;
}

const PROVIDER_CLASS: Record<string, string> = {
  facebook: "fb",
  linkedin: "li",
  whatsapp: "wa",
};

export function Connections({ providers, refresh, verify, checking }: Props) {
  const [loginState, setLoginState] = useState<LoginState | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<Provider | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const streamCloser = useRef<(() => void) | null>(null);
  const { toast } = useToast();
  const anyChecking = Object.values(checking).some(Boolean);

  useEffect(() => () => streamCloser.current?.(), []);

  async function connect(provider: Provider) {
    setLoginState({ providerId: provider.id, status: "opening" });
    try {
      const { runId } = await postJSON<{ runId: string }>(`/api/login/${provider.id}`, {});
      streamCloser.current = streamRun(runId, (e) => {
        if (e.type === "progress") {
          const s = e.data?.status as string;
          if (s === "login-window-opened") {
            setLoginState({ providerId: provider.id, status: "waiting" });
          } else if (s === "logged-in") {
            setLoginState({ providerId: provider.id, status: "done" });
          }
        }
        if (e.type === "done") {
          setLoginState(null);
          // Authoritative re-check: refresh() deliberately keeps the previous
          // loggedIn flag for known providers (it trusts /verify, not the
          // optimistic /providers), so calling it here would leave the badge
          // stuck on its pre-login "Disconnected". verify() flips it correctly.
          verify();
          toast(`${provider.label} connected`, "success");
        }
        if (e.type === "error") {
          setLoginState({ providerId: provider.id, status: "error", message: e.data?.message });
          refresh();
          toast(e.data?.message ?? `Failed to connect ${provider.label}`, "error");
        }
      });
    } catch (err) {
      setLoginState({ providerId: provider.id, status: "error", message: (err as Error).message });
      toast((err as Error).message, "error");
    }
  }

  async function disconnect(provider: Provider) {
    setConfirmDisconnect(null);
    setDisconnecting(provider.id);
    try {
      await logout(provider.id);
      // verify(), not refresh(): refresh keeps the stale "Connected" flag.
      await verify();
      toast(`${provider.label} disconnected`, "info");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDisconnecting(null);
    }
  }

  function loginProgress(id: string): string | null {
    if (!loginState || loginState.providerId !== id) return null;
    if (loginState.status === "opening") return "Opening browser…";
    if (loginState.status === "waiting") return "Finish login in the popup window…";
    if (loginState.status === "done") return "Logged in!";
    if (loginState.status === "error") return loginState.message ?? "Error";
    return null;
  }

  return (
    <div className="content-container">
      <div className="connections-header">
        <div>
          <p className="text-sm text-muted" style={{ marginTop: 2 }}>
            Connect your social accounts to start broadcasting and reading messages.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={verify}
          disabled={!!loginState || anyChecking}
          title="Re-check the real login status of each account"
        >
          {anyChecking ? (
            <Spinner size="sm" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          )}
          {anyChecking ? "Checking…" : "Refresh"}
        </Button>
      </div>

      <div className="connections-grid">
        {providers.map((p) => {
          const cls = PROVIDER_CLASS[p.id] ?? "";
          const isConnecting = loginState?.providerId === p.id;
          const isDisconnecting = disconnecting === p.id;
          const isChecking = !!checking[p.id];
          const progress = loginProgress(p.id);

          return (
            <div key={p.id} className={`connection-card ${cls}`}>
              <div className={`connection-logo ${cls}`}>
                <ProviderIcon provider={p.id} size={28} />
              </div>

              <div className="connection-name">{p.label}</div>

              <div
                className={`connection-badge ${
                  isChecking ? "checking" : p.loggedIn ? "connected" : "disconnected"
                }`}
              >
                <span className="connection-badge-dot" />
                {isChecking ? "Checking…" : p.loggedIn ? "Connected" : "Disconnected"}
              </div>

              <div className="connection-progress">
                {isConnecting && progress && (
                  <span style={{ color: "var(--accent-soft)" }}>{progress}</span>
                )}
                {!isConnecting && isChecking && (
                  <span style={{ color: "var(--muted)" }}>Verifying real session…</span>
                )}
              </div>

              {p.loggedIn ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={isDisconnecting}
                  onClick={() => setConfirmDisconnect(p)}
                >
                  {isDisconnecting ? <Spinner size="sm" /> : null}
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isConnecting}
                  onClick={() => connect(p)}
                >
                  {isConnecting ? <Spinner size="sm" /> : null}
                  {isConnecting ? "Connecting…" : "Connect"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {confirmDisconnect && (
        <Modal
          title={`Disconnect ${confirmDisconnect.label}?`}
          onClose={() => setConfirmDisconnect(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDisconnect(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => disconnect(confirmDisconnect)}>
                Disconnect
              </Button>
            </>
          }
        >
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
            This will delete your saved {confirmDisconnect.label} session. You will need to log in again to use this account.
          </p>
        </Modal>
      )}
    </div>
  );
}
