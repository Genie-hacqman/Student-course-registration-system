import * as slipService from '../services/slip.service.js';
import * as audit from '../services/audit.service.js';
import { renderSlipPdf } from '../utils/pdf/registrationSlip.js';
import { ok } from '../utils/response.js';

/** Sends the slip as a PDF download (default) or as JSON (?format=json) for a frontend to render. */
const send = async (req, res, slip) => {
  if (req.validated.query.format === 'json') return ok(res, slip);

  await audit.log({
    userId: req.user.id,
    action: 'registration.slip_printed',
    entityType: 'Registration',
    entityId: req.validated.params.id,
    metadata: { referenceNumber: slip.referenceNumber, verificationCode: slip.verificationCode },
    req,
  });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="registration-slip-${slip.referenceNumber}.pdf"`);
  res.set('Cache-Control', 'no-store');
  renderSlipPdf(slip, res);
  return undefined;
};

export const mySlip = async (req, res) => send(req, res, await slipService.getSlipForStudent(req.user.id, req.validated.params.id));
export const staffSlip = async (req, res) => send(req, res, await slipService.getSlipForStaff(req.validated.params.id));
export const verify = async (req, res) =>
  ok(res, await slipService.verify(req.validated.params.reference, req.validated.query.code));
