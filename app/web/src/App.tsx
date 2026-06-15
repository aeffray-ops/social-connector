import { useCallback, useEffect, useState } from "react";
import { getJSON, Provider } from "./api.js";
import { Sidebar } from "./components/Sidebar.js";
import { TopBar } from "./components/TopBar.js";
import { ToastProvider } from "./components/Toast.js";
import { Broadcast } from "./views/Broadcast.js";
import { Inbox } from "./views/Read.js";
import { Assistant } from "./views/Ai.js";
import { Connections } from "./views/Sessions.js";

type View = "broadcast" | "inbox" | "assistant" | "connections";

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  broadcast: { title: "Broadcast", subtitle: "Send one message to all your channels at once" },
  inbox: { title: "Inbox", subtitle: "Read and manage your recent conversations" },
  assistant: { title: "Assistant", subtitle: "Intelligent agent for your social accounts" },
  connections: { title: "Connections", subtitle: "Manage your social provider sessions" },
};

export function App() {
  const [view, setView] = useState<View>("broadcast");
  const [providers, setProviders] = useState<Provider[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await getJSON<Provider[]>("/api/providers");
      setProviders(data);
    } catch {
      // silently fail — providers stay as-is
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const meta = VIEW_META[view];

  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar activeView={view} onNav={setView} providers={providers} />
        <div className="main-area">
          <TopBar title={meta.title} subtitle={meta.subtitle} providers={providers} />
          <div className="content-area">
            {view === "broadcast" && <Broadcast providers={providers} />}
            {view === "inbox" && <Inbox />}
            {view === "assistant" && <Assistant />}
            {view === "connections" && (
              <Connections providers={providers} refresh={refresh} />
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
