import { Router } from 'express';
import { verifyLimiter } from '../middleware/rate-limit.middleware.js';
import * as webhook from '../services/email-webhook.service.js';

/**
 * Provider callbacks. Mounted in app.js *before* express.json with express.raw, because the signature
 * covers the exact bytes Resend sent.
 */
const router = Router();

router.post('/resend', verifyLimiter, async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const event = webhook.verifyEvent(body, req.headers);
  const result = await webhook.applyEvent(event);
  res.status(200).json({ success: true, data: { received: true, ...result } });
});

export default router;
