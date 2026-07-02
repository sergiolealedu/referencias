import { Router } from 'express';
import { z } from 'zod';

import {
  getDeviceSession,
  getDeviceSessionByAuthToken,
  registerDevice,
} from '../deviceManager.js';
import {
  getAuthTokenFromRequest,
  getDeviceIdFromRequest,
} from '../middleware/deviceAuth.js';

const registerSchema = z.object({
  deviceId: z.string().uuid().optional(),
  label: z.string().max(120).nullable().optional(),
});

export function createDeviceRouter(): Router {
  const router = Router();

  router.post('/register', (req, res) => {
    try {
      const body = registerSchema.parse(req.body ?? {});
      const session = registerDevice(body.deviceId, body.label ?? null);
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
        return;
      }
      console.error('Erro ao registrar dispositivo:', error);
      res.status(500).json({ error: 'Não foi possível registrar o dispositivo' });
    }
  });

  router.get('/session', (req, res) => {
    const authToken = getAuthTokenFromRequest(req);
    if (authToken) {
      const session = getDeviceSessionByAuthToken(authToken);
      if (!session) {
        res.status(401).json({ error: 'Token de autenticação inválido.' });
        return;
      }
      res.json(session);
      return;
    }

    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      res.status(401).json({ error: 'Token de autenticação ausente (header X-Auth-Token).' });
      return;
    }

    const session = getDeviceSession(deviceId) ?? registerDevice(deviceId);
    res.json(session);
  });

  return router;
}
