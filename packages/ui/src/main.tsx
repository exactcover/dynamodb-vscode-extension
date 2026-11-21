import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty">
          <h2>The client hit an error</h2>
          <p>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
