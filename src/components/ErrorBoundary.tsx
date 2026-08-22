import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught error anywhere in the tree unmounts the whole app,
 * leaving a blank window with no way back except force-quitting. This turns
 * that into a recoverable screen instead.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background text-on-background px-8">
          <span className="material-symbols-outlined text-[48px] text-error">error</span>
          <div className="text-center space-y-1">
            <p className="font-headline-md text-[18px] font-medium">Something went wrong</p>
            <p className="font-body-ui text-body-ui text-on-surface-variant max-w-md">
              Scriptura hit an unexpected error and couldn't continue. Reloading usually fixes it.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-DEFAULT font-body-ui text-sm bg-primary text-on-primary hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
          <details className="mt-2 max-w-lg">
            <summary className="font-metadata-mono text-[11px] text-on-surface-variant cursor-pointer">
              Error details
            </summary>
            <pre className="font-metadata-mono text-[11px] text-on-surface-variant whitespace-pre-wrap mt-1">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
