import * as applicationService from '../services/application.service.js';
import { ok, created, paginated } from '../utils/response.js';

// Public
export const signUp = async (req, res) => {
  await applicationService.signUp(req.validated.body, req);
  // The same answer whether or not the email was already registered.
  return res.status(202).json({
    success: true,
    data: { message: 'If this email can be used, your account is ready — check your inbox to confirm your email address, then sign in.' },
  });
};
export const activate = async (req, res) => ok(res.set('Cache-Control', 'no-store'), await applicationService.activate(req.validated.body, req));

// Applicant (always their own application: no id in the route)
export const options = async (req, res) => ok(res, await applicationService.options());
export const mine = async (req, res) => ok(res, await applicationService.getMine(req.user.id));
export const saveMine = async (req, res) => ok(res, await applicationService.saveDraft(req.user.id, req.validated.body, req));
export const submitMine = async (req, res) => ok(res, await applicationService.submit(req.user.id, req));

// Official application photo. The upload is the raw image bytes (see the express.raw parser in app.js).
const sendPhoto = (res, bytes) => {
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'Content-Length': bytes.length });
  return res.status(200).end(bytes);
};
export const setPhoto = async (req, res) =>
  ok(res, await applicationService.setPhoto(req.user.id, { body: req.body, contentType: req.headers['content-type'] }, req));
export const removePhoto = async (req, res) => ok(res, await applicationService.removePhoto(req.user.id, req));
export const myPhoto = async (req, res) => sendPhoto(res, await applicationService.getMyPhoto(req.user.id));
export const reviewPhoto = async (req, res) => sendPhoto(res, await applicationService.getPhotoForReview(req.validated.params.id));

// Reviewers. Activation tokens returned by the service are never sent to the client.
export const list = async (req, res) => {
  const { result, page, limit } = await applicationService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await applicationService.getById(req.validated.params.id));
export const admit = async (req, res) => {
  const { application, emailDelivery } = await applicationService.admit(req.validated.params.id, req.validated.body, req.user, req);
  return ok(res, { application, emailDelivery });
};
export const reject = async (req, res) =>
  ok(res, await applicationService.reject(req.validated.params.id, req.validated.body, req.user, req));
export const resendActivation = async (req, res) => {
  const { emailDelivery } = await applicationService.resendActivation(req.validated.params.id, req.user, req);
  return ok(res, {
    message: emailDelivery.sent
      ? "A new activation email was sent to the applicant's personal email."
      : `A new activation link was issued, but the email could not be sent: ${emailDelivery.error}`,
    emailDelivery,
  });
};
