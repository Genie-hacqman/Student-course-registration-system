import crypto from 'node:crypto';

// Always minted here: the id ends up in audit rows, so a caller must not be able to choose it.
export const requestId = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.set('x-request-id', req.id);
  next();
};
