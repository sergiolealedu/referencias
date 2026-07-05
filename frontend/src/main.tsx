import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { DeviceGate } from './components/DeviceGate';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DeviceGate>
        <App />
      </DeviceGate>
    </QueryClientProvider>
  </StrictMode>,
);

// #region agent log
fetch('http://127.0.0.1:7564/ingest/3b190956-9a72-49a4-a911-5f9d4ca65594', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': 'd8e57d',
  },
  body: JSON.stringify({
    sessionId: 'd8e57d',
    runId: 'pre-fix',
    hypothesisId: 'B',
    location: 'main.tsx:boot',
    message: 'react root render invoked',
    data: { hasRoot: !!document.getElementById('root') },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion
