import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Terjadi Kesalahan</h1>
            <p className="text-gray-600 mb-6">
              Maaf, terjadi error yang tidak terduga. Silakan refresh halaman atau kembali ke dashboard.
            </p>
            <div className="space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary px-4 py-2"
              >
                Refresh
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="btn btn-primary px-4 py-2"
              >
                Ke Dasbor
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
