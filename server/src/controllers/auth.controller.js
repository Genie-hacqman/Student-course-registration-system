import env from '../config/env.js';
import * as authService from '../services/auth.service.js';
import * as pinService from '../services/pin.service.js';
import { ok, noContent } from '../utils/response.js';
import { REFRESH_COOKIE } from '../utils/constants.js';

const COOKIE_PATH = '/api/auth';

const meta = (req) => ({ req, ip: req.ip, userAgent: req.get('user-agent') });

/**
 * The refresh token lives only in an HTTP-only cookie; frontend JavaScript never sees it. It is a
 * browser-session cookie (no Expires), so fully closing the browser signs the user out; the token's
 * own expiry (refresh_tokens.expires_at) still bounds a browser that stays open.
 */
const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.isProduction, sameSite: 'strict', path: COOKIE_PATH });
};

const authResponse = (res, { user, accessToken, refreshToken }, send = ok) => {
  setRefreshCookie(res, refreshToken);
  return send(res, { user, accessToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_EXPIRES });
};

export const login = async (req, res) => authResponse(res, await authService.login(req.validated.body, meta(req)));

export const refresh = async (req, res) => {
  try {
    const tokens = await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    setRefreshCookie(res, tokens.refreshToken);
    return ok(res, { accessToken: tokens.accessToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_EXPIRES });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const logout = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], req.user?.id, req, req.auth);
  clearRefreshCookie(res);
  return ok(res, { message: 'Logged out' });
};

export const logoutAll = async (req, res) => {
  await authService.logoutAll(req.user.id, req);
  clearRefreshCookie(res);
  return ok(res, { message: 'Logged out on all devices' });
};

export const forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.validated.body.email);
  // Same answer whatever happened (link sent, request filed for approval, or no such account).
  return ok(res, { message: 'If an account exists for that email, your request has been received. You will get an email with a reset link once it is approved by the administrator.' });
};

export const resetPassword = async (req, res) => {
  await authService.resetPassword(req.validated.body);
  clearRefreshCookie(res);
  return ok(res, { message: 'Password has been reset. Please log in.' });
};

export const me = async (req, res) => ok(res, await authService.me(req.user.id));

export const updateProfile = async (req, res) => ok(res, await authService.updateProfile(req.user.id, req.validated.body, req));

export const verifyEmail = async (req, res) => {
  await authService.verifyEmail(req.validated.body);
  return ok(res, { message: 'Your email address is verified.' });
};

export const resendVerification = async (req, res) => {
  await authService.resendVerification(req.user.id);
  return ok(res, { message: 'A new verification link has been sent to your email address.' });
};

export const sessions = async (req, res) => ok(res, await authService.listSessions(req.user.id, req.cookies?.[REFRESH_COOKIE]));

export const endSession = async (req, res) => {
  await authService.endSession(req.user.id, req.validated.params.id, req.cookies?.[REFRESH_COOKIE], req);
  return noContent(res);
};

export const changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.validated.body);
  clearRefreshCookie(res);
  return ok(res, { message: 'Password changed. Please log in again.' });
};

// ── student PINs ──────────────────────────────────────────────────────────────

/** Every session ends on a PIN change; this device gets fresh tokens straight away. */
export const changePin = async (req, res) => authResponse(res, await pinService.changePin(req.user.id, req.validated.body, meta(req)));

export const forgotPin = async (req, res) => {
  await pinService.forgotPin(req.validated.body);
  // Same answer whether or not the student ID and email matched.
  return ok(res, { message: 'If the student ID and school email match, a 6-digit code has been sent to that email. It expires in 10 minutes.' });
};

export const resetPin = async (req, res) => {
  await pinService.resetPinWithOtp(req.validated.body);
  clearRefreshCookie(res);
  return ok(res, { message: 'Your PIN has been reset. Sign in with your student ID and new PIN.' });
};
