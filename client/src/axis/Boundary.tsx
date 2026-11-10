// A failure inside one layer (the battle stage, say) must never take the map down with it.
import { Component, type ReactNode } from 'react';

export class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('axis layer failed', error);
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
