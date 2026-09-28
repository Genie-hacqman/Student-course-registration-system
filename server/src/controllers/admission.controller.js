import * as admissionService from '../services/admission.service.js';
import * as pinService from '../services/pin.service.js';
import { ok, created } from '../utils/response.js';

// Responses carry one-time PINs: never cache them anywhere between here and the staff member's screen.
const noStore = (res) => res.set('Cache-Control', 'no-store');

export const admit = async (req, res) => created(noStore(res), await admissionService.admit(req.validated.body, req.user));
export const admitMany = async (req, res) => ok(noStore(res), await admissionService.admitMany(req.validated.body, req.user));
export const resetPin = async (req, res) => ok(noStore(res), await pinService.issueTemporaryPin(req.validated.params.id, req.user));
