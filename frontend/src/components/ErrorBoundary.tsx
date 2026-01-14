import React from 'react';

export class ErrorBoundary extends React.Component<any, { error?: Error | null; hasError: boolean }> {
  state = { error: null as Error | null, hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null, hasError: false });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-rose-600 text-xl font-semibold mb-4">
              Something went wrong
            </div>
            <div className="text-gray-700 mb-4">
              The application encountered an error and couldn't continue. This might be due to:
            </div>
            <ul className="list-disc list-inside text-sm text-gray-600 mb-6 space-y-1">
              <li>A missing dependency or module</li>
              <li>Configuration issues</li>
              <li>Network connectivity problems</li>
            </ul>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono text-gray-800 mb-6 overflow-auto max-h-32">
              {this.state.error.message}
            </div>
            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded transition"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactNode;
  }
}
