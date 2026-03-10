import React, { StrictMode, Suspense, lazy, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as ReduxProvider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { AnalyticsProvider } from '@/providers/AnalyticsProvider';
import { store, persistor } from '@/store';
import { setupErrorHandling } from '@/utils/errorHandling';
import { initMonitoring } from '@/utils/monitoring';
import { registerSW } from '@/utils/serviceWorker';
import { logger } from '@/utils/logger';
import { setupPerformanceMonitoring } from '@/utils/performance';
import '@/index.css';

// ============================================
// LAZY LOADING COMPONENTS
// ============================================
const App = lazy(() => import('./App').then(module => ({ default: module.default })));

// Fallback component during loading
const LoadingFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
    <div className="text-center">
      {/* Neural Loader Animation */}
      <div className="relative w-24 h-24 mx-auto mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-neon-green border-b-neon-blue animate-spin-slow" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-neon-pink border-b-neon-yellow animate-spin-reverse" />
        <div className="absolute inset-4 rounded-full border-4 border-transparent border-t-neon-cyan border-b-neon-purple animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-mono text-white/80 animate-pulse">Ω</span>
        </div>
      </div>
      
      {/* Loading Text */}
      <div className="space-y-2">
        <h2 className="text-xl font-mono text-neon-green animate-pulse">
          Inicializando ATENA Ω
        </h2>
        <p className="text-sm text-gray-400 font-mono" id="loading-status">
          Estabelecendo conexão neural...
        </p>
      </div>
      
      {/* Loading Progress */}
      <div className="w-64 h-1 bg-gray-800 rounded-full mt-8 mx-auto overflow-hidden">
        <div className="h-full bg-gradient-to-r from-neon-green to-neon-blue animate-loading-bar" />
      </div>
    </div>
  </div>
);

// ============================================
// ERROR FALLBACK COMPONENT
// ============================================
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-red-500/30">
      <div className="text-center mb-6">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Erro no Sistema Neural</h2>
        <p className="text-gray-400 font-mono text-sm mb-4 break-all">
          {error.message || 'Erro desconhecido'}
        </p>
        <details className="text-left bg-gray-900/50 rounded-lg p-4 mb-6">
          <summary className="text-neon-green cursor-pointer font-mono text-sm mb-2">
            Detalhes Técnicos
          </summary>
          <pre className="text-xs text-gray-400 overflow-auto max-h-40">
            {error.stack}
          </pre>
        </details>
      </div>
      
      <div className="space-y-3">
        <button
          onClick={resetErrorBoundary}
          className="w-full py-3 px-4 bg-gradient-to-r from-neon-green to-neon-blue text-gray-900 font-bold rounded-lg hover:opacity-90 transition-opacity"
        >
          Reiniciar Interface
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 px-4 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors"
        >
          Recarregar Página
        </button>
      </div>
    </div>
  </div>
);

// ============================================
// ERROR HANDLER
// ============================================
const errorHandler = (error: Error, info: ErrorInfo) => {
  logger.error('React Error Boundary caught an error:', error);
  logger.error('Component stack:', info.componentStack);
  
  // Send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Sentry.captureException(error, { extra: info });
    console.error('Error sent to monitoring:', error);
  }
};

// ============================================
// QUERY CLIENT SETUP
// ============================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: process.env.NODE_ENV === 'production',
      refetchOnReconnect: true,
      suspense: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ============================================
// INITIALIZATION
// ============================================
const initializeApp = async () => {
  // Setup global error handling
  setupErrorHandling();
  
  // Initialize monitoring in production
  if (process.env.NODE_ENV === 'production') {
    initMonitoring();
    setupPerformanceMonitoring();
  }
  
  // Register service worker
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    registerSW();
  }
  
  // Log environment info
  logger.info('🚀 ATENA Ω inicializando...', {
    environment: process.env.NODE_ENV,
    version: __APP_VERSION__,
    buildTime: __BUILD_TIME__,
  });
};

// ============================================
// RENDER APP
// ============================================
const renderApp = () => {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Elemento root não encontrado');
  }
  
  const root = createRoot(rootElement);
  
  root.render(
    <StrictMode>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={errorHandler}
        onReset={() => {
          // Clear any stale state
          window.location.href = '/';
        }}
      >
        <HelmetProvider>
          <ReduxProvider store={store}>
            <PersistGate loading={null} persistor={persistor}>
              <QueryClientProvider client={queryClient}>
                <ThemeProvider defaultTheme="dark" storageKey="atena-theme">
                  <WebSocketProvider
                    url={process.env.VITE_WS_URL || 'ws://localhost:3000/ws'}
                    reconnectAttempts={5}
                    reconnectInterval={3000}
                  >
                    <NotificationProvider>
                      <AnalyticsProvider>
                        <Suspense fallback={<LoadingFallback />}>
                          <App />
                        </Suspense>
                      </AnalyticsProvider>
                    </NotificationProvider>
                  </WebSocketProvider>
                </ThemeProvider>
                
                {/* Devtools only in development */}
                {process.env.NODE_ENV === 'development' && (
                  <>
                    <ReactQueryDevtools initialIsOpen={false} />
                  </>
                )}
              </QueryClientProvider>
            </PersistGate>
          </ReduxProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </StrictMode>
  );
};

// ============================================
// START APP
// ============================================
initializeApp()
  .then(() => {
    renderApp();
    
    // Remove initial loading if exists
    const initialLoading = document.getElementById('initial-loading');
    if (initialLoading) {
      initialLoading.classList.add('fade-out');
      setTimeout(() => {
        if (initialLoading.parentNode) {
          initialLoading.parentNode.removeChild(initialLoading);
        }
      }, 500);
    }
    
    // Dispatch event that React is mounted
    document.dispatchEvent(new CustomEvent('react-mounted'));
  })
  .catch(error => {
    logger.error('Falha na inicialização:', error);
    
    // Show error in loading element
    const loadingStatus = document.getElementById('loading-status');
    if (loadingStatus) {
      loadingStatus.textContent = 'Erro na inicialização. Recarregue a página.';
      loadingStatus.classList.add('text-red-500');
    }
  });

// ============================================
// HOT MODULE REPLACEMENT
// ============================================
if (import.meta.hot) {
  import.meta.hot.accept();
}

// ============================================
// GLOBAL TYPES
// ============================================
declare global {
  interface Window {
    __APP_VERSION__: string;
    __BUILD_TIME__: string;
    __ATENA_CONFIG__: any;
  }
  
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
          }
