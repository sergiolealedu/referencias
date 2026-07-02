import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { DeviceGate } from './components/DeviceGate';
import { ServerUrlGate } from './components/ServerUrlGate';
import { MobileApp } from './layouts/MobileApp';
import { isNativePlatform } from './platform/native';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
});

function RootApp() {
  const native = isNativePlatform();
  const content = (
    <DeviceGate>{native ? <MobileApp /> : <App />}</DeviceGate>
  );

  if (native) {
    return <ServerUrlGate>{content}</ServerUrlGate>;
  }

  return content;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootApp />
    </QueryClientProvider>
  </StrictMode>,
);
