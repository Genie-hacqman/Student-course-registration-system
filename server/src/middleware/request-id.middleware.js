import crypto from 'node:crypto';

export const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set('x-request-id', req.id);
  next();
};
