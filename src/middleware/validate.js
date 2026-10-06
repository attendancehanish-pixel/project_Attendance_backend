import { ApiError } from '../utils/api-error.js';

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema(req.body || {});
    next();
  } catch (e) {
    next(e instanceof ApiError ? e : new ApiError(400, e.message));
  }
};