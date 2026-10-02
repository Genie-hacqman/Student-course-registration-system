import { useMutation } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const authApi = {
  login: (body) => api.post('/auth/login', body).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  logoutAll: () => api.post('/auth/logout-all').then(unwrap),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then(unwrap),
  resetPassword: (body) => api.post('/auth/reset-password', body).then(unwrap),
  changePassword: (body) => api.patch('/auth/password', body).then(unwrap),
  // Students: the forced first change, and recovery by a code sent to the school email.
  changePin: (body) => api.patch('/auth/pin', body).then(unwrap),
  forgotPin: (body) => api.post('/auth/pin/forgot', body).then(unwrap),
  resetPin: (body) => api.post('/auth/pin/reset', body).then(unwrap),
  updateProfile: (body) => api.patch('/auth/me', body).then(unwrap),
  setAvatar: (image) => api.put('/auth/me/avatar', { image }).then(unwrap),
  removeAvatar: () => api.delete('/auth/me/avatar').then(unwrap),
  verifyEmail: (body) => api.post('/auth/verify-email', body).then(unwrap),
  resendVerification: () => api.post('/auth/verify-email/resend').then(unwrap),
  sessions: () => api.get('/auth/sessions').then(unwrap),
  changeRequests: () => api.get('/auth/change-requests').then(unwrap),
  createChangeRequest: (body) => api.post('/auth/change-requests', body).then(unwrap),
  cancelChangeRequest: (id) => api.delete(`/auth/change-requests/${id}`).then(unwrap),
  endSession: (id) => api.delete(`/auth/sessions/${id}`),
}

export const useForgotPassword = () => useMutation({ mutationFn: authApi.forgotPassword })
export const useResetPassword = () => useMutation({ mutationFn: authApi.resetPassword })
export const useChangePassword = () => useMutation({ mutationFn: authApi.changePassword })
export const useForgotPin = () => useMutation({ mutationFn: authApi.forgotPin })
export const useResetPin = () => useMutation({ mutationFn: authApi.resetPin })
