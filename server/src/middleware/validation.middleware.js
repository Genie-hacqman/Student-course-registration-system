import { ValidationError } from '../utils/errors.js';

const formatIssues = (issues, location) =>
  issues.map((issue) => ({
    location,
    field: issue.path.join('.'),
    message: issue.message,
  }));

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed (coerced) values are stored on req.validated so controllers never read raw input.
 */
export const validate = (schemas) => (req, res, next) => {
  const errors = [];
  req.validated = {};

  for (const location of ['params', 'query', 'body']) {
    const schema = schemas[location];
    if (!schema) continue;
    const result = schema.safeParse(req[location] ?? {});
    if (result.success) req.validated[location] = result.data;
    else errors.push(...formatIssues(result.error.issues, location));
  }

  if (errors.length) throw new ValidationError('Validation failed', errors);
  next();
};
