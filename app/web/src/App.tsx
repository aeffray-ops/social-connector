import { useCallback, useEffect, useState } from "react";
import { getJSON, verifyProvider, Provider } from "./api.js";
import { Sidebar } from "./components/Sidebar.js";
import { TopBar } from "./components/TopBar.js";
import { ToastProvider } from "./components/Toast.js";
import { Broadcast } from "./views/Broadcast.js";
import { Studio } from "./views/Studio.js";
import { Planning } from "./views/Planning.js";
import { Inbox } from "./views/Read.js";
import { Assistant } from "./views/Ai.js";
import { Connections } from "./views/Sessions.js";
import { Settings } from "./views/Settings.js";

type View = "studio" | "planning" | "broadcast" | "inbox" | "assistant" | "connections" | "settings";

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  studio: { title: "Studio", subtitle: "Génère et publie tes contenus" },
  planning: { title: "Planning", subtitle: "Tes publications programmées" },
  broadcast: { title: "Broadcast", subtitle: "Send one message to all your channels at once" },
  inbox: { title: "Inbox", subtitle: "Read and manage your recent conversations" },
  assistant: { title: "Assistant", subtitle: "Intelligent agent for your social accounts" },
  connections: { title: "Connections", subtitle: "Manage your social provider sessions" },
  settings: { title: "Settings", subtitle: "API keys for the AI Assistant, stored locally" },
};

export function App() {
  const [view, setView] = useState<View>("studio");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  // Instant, optimistic load (profile-dir hint) — just for a fast first paint.
  const refresh = useCallback(async () => {
    try {
      const data = await getJSON<Provider[]>("/api/providers");
      setProviders((prev) =>
        // Keep any already-verified loggedIn flags; only adopt new ids/labels.
        data.map((d) => {
          const known = prev.find((p) => p.id === d.id);
          return known ? { ...d, loggedIn: known.loggedIn } : d;
        }),
      );
      return data;
    } catch {
      return [] as Provider[];
    }
  }, []);

  // Authoritative check: hit /verify for each provider in parallel and correct
  // each badge as its real result arrives (fast providers don't wait on slow
  // ones like WhatsApp). This is what makes Refresh trustworthy.
  const verify = useCallback(async () => {
    const data = await getJSON<Provider[]>("/api/providers").catch(() => [] as Provider[]);
    const ids = data.length ? data.map((p) => p.id) : ["facebook", "whatsapp", "linkedin"];
    if (data.length) setProviders((prev) => (prev.length ? prev : data));
    setChecking(Object.fromEntries(ids.map((id) => [id, true])));
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { loggedIn } = await verifyProvider(id);
          setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, loggedIn } : p)));
        } catch {
          /* leave the optimistic value in place */
        } finally {
          setChecking((prev) => ({ ...prev, [id]: false }));
        }
      }),
    );
  }, []);

  useEffect(() => {
    // First paint instantly, then correct with the real check.
    refresh().then(() => verify());
  }, [refresh, verify]);

  const meta = VIEW_META[view];

  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar activeView={view} onNav={setView} providers={providers} />
        <div className="main-area">
          <TopBar title={meta.title} subtitle={meta.subtitle} providers={providers} />
          <div className="content-area">
            {view === "studio" && <Studio providers={providers} />}
            {view === "planning" && <Planning providers={providers} />}
            {view === "broadcast" && <Broadcast providers={providers} />}
            {view === "inbox" && <Inbox />}
            {view === "assistant" && <Assistant />}
            {view === "connections" && (
              <Connections
                providers={providers}
                refresh={refresh}
                verify={verify}
                checking={checking}
              />
            )}
            {view === "settings" && <Settings />}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
