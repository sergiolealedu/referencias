import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { DeviceSession } from '../types/device';
import { getAuthToken } from '../utils/device';
import { DeviceOnboarding } from './DeviceOnboarding';

interface DeviceGateProps {
  children: ReactNode;
}

async function bootstrapSession(): Promise<DeviceSession> {
  if (getAuthToken()) {
    try {
      return await api.getDeviceSession();
    } catch {
      // Token inválido — tenta registrar novamente abaixo.
    }
  }

  return api.registerDevice();
}

export function DeviceGate({ children }: DeviceGateProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSession = await bootstrapSession();
      setSession(nextSession);
      queryClient.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  if (loading) {
    return (
      <div className="device-onboarding">
        <div className="device-onboarding-card">
          <p>Conectando dispositivo…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-onboarding">
        <div className="device-onboarding-card">
          <p className="error">Erro ao conectar: {error}</p>
          <button type="button" className="primary" onClick={() => void bootstrap()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (session?.needsOnboarding) {
    return <DeviceOnboarding onComplete={() => void bootstrap()} />;
  }

  return <>{children}</>;
}
