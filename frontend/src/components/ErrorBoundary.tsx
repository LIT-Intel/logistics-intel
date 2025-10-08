import React from 'react';

export class ErrorBoundary extends React.Component<any, { error?: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-sm text-rose-700">
          Something broke on this page.
          <br />
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children as React.ReactNode;
  }
}
