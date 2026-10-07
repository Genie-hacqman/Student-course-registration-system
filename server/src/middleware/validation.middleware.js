import { ValidationError } from '../utils/errors.js';

const formatIssues = (issues, location) =>
  issues.map((issue) => ({
    location,
    field: issue.path.join('.'),
    message: issue.message,
  }));

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
