import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The globe is not allowed to take the channel with it.
 *
 * A phone that refuses a WebGL context makes three.js throw during render, and an uncaught
 * render error unmounts the whole React tree — measured: the TopBar, the running order and the
 * dock all vanished, leaving a blank page. That is the worst failure this product has, because
 * it looks like the site is broken rather than like the planet did not load.
 *
 * With this, a failed globe is just a slate saying so, and everything else keeps working: the
 * chyron, the running order, the stories, the chat and the email all run without a canvas.
 */
export class GlobeBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[meanwhile] the globe failed to start — the channel continues without it:", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
