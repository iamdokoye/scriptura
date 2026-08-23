import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * Use for a boundary scoped to one feature (a sheet, an overlay, a single view)
   * rather than the whole app — renders a small dismissible toast instead of taking
   * over the screen, so a crash in one feature doesn't read as "the app is broken."
   */
  compact?: boolean;
  /** Label shown in the compact fallback, e.g. "Strong's lookup", "Cross-references". */
  label?: string;
  /**
   * For a boundary scoped to one view/panel rather than a small overlay: fills its
   * container's height (not the full viewport, so it doesn't fight a TopBar or shell
   * chrome above it) and offers a lighter recovery than a full reload — e.g. "Go to
   * Reading" instead of reloading the whole app. Ignored if `compact` is set.
   */
  onReset?: () => void;
  resetLabel?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught error anywhere in the tree unmounts the whole app,
 * leaving a blank window with no way back except force-quitting. This turns
 * that into a recoverable screen instead.
 *
 * Scope one of these around each independent feature (not just the root) so a
 * crash in, say, the cross-references sheet can't blank the entire reading view —
 * see ReadingView.tsx's `sheets` block. A boundary only clears its own error state
 * on remount, so wrap content that naturally remounts on retry (e.g. keyed on the
 * thing that changes when the user "tries again" — a new verse, a fresh open).
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
      if (this.props.compact) {
        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-DEFAULT bg-error-container text-on-error-container shadow-lg max-w-sm">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <p className="font-body-ui text-[13px]">
              {this.props.label ? `${this.props.label} failed to load.` : "This didn't load."} Try again.
            </p>
          </div>
        );
      }
      const scoped = this.props.onReset !== undefined;
      return (
        <div className={`${scoped ? "h-full" : "h-screen"} flex flex-col items-center justify-center gap-4 bg-background text-on-background px-8`}>
          <span className="material-symbols-outlined text-[48px] text-error">error</span>
          <div className="text-center space-y-1">
            <p className="font-headline-md text-[18px] font-medium">Something went wrong</p>
            <p className="font-body-ui text-body-ui text-on-surface-variant max-w-md">
              {scoped
                ? `${this.props.label ?? "This view"} hit an unexpected error and couldn't continue.`
                : "Scriptura hit an unexpected error and couldn't continue. Reloading usually fixes it."}
            </p>
          </div>
          <button
            onClick={scoped ? this.props.onReset : () => window.location.reload()}
            className="px-4 py-2 rounded-DEFAULT font-body-ui text-sm bg-primary text-on-primary hover:opacity-90 transition-opacity"
          >
            {scoped ? this.props.resetLabel ?? "Go back" : "Reload"}
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
