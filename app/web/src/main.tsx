import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary label="Cockpit">
    <App />
  </ErrorBoundary>,
);
