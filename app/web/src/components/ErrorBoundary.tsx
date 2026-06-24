import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Libellé de la zone protégée (affiché dans l'encart de secours). */
  label?: string;
  /**
   * Quand une de ces valeurs change, la frontière se ré-arme automatiquement.
   * Ex. : la vue active — changer d'onglet « répare » l'écran sans recharger.
   */
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
}

/**
 * Garde-fou : capture toute exception levée pendant le rendu d'un sous-arbre et
 * affiche un encart de secours (à la charte IDEAL) au lieu de laisser React
 * démonter toute l'application → plus JAMAIS d'écran noir.
 *
 * - `componentDidCatch` logge l'erreur réelle dans la console (pour diagnostic).
 * - « Réessayer » ré-arme la frontière (récupère un crash transitoire sans reload).
 * - `resetKeys` ré-arme automatiquement quand le contexte change (ex. : onglet).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Garde une trace exploitable même quand l'UI est rattrapée.
    console.error(`[IDEAL] Crash rattrapé${this.props.label ? ` (${this.props.label})` : ""} :`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (!this.state.error) return;
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          margin: "24px auto",
          maxWidth: 560,
          padding: 24,
          borderRadius: "var(--radius, 12px)",
          border: "1px solid var(--border, #e5e0d8)",
          borderTop: "4px solid #800020",
          background: "var(--surface, #fff)",
          color: "var(--text, #2b2b2b)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>🛟</div>
        <h3 style={{ fontFamily: "var(--font-display, Montserrat), sans-serif", margin: "0 0 6px", color: "#800020" }}>
          Oups, cette partie a planté
        </h3>
        <p style={{ fontSize: 14, color: "var(--muted, #6b6b6b)", margin: "0 0 18px" }}>
          {this.props.label ? `${this.props.label} — ` : ""}le reste du cockpit fonctionne toujours.
          Réessaie, ou recharge si ça persiste.
        </p>
        <details style={{ textAlign: "left", fontSize: 12, color: "var(--muted, #6b6b6b)", marginBottom: 18 }}>
          <summary style={{ cursor: "pointer" }}>Détail technique</summary>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{error.message}</pre>
        </details>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={this.reset}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "#800020",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--border, #e5e0d8)",
              background: "transparent",
              color: "var(--text, #2b2b2b)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
