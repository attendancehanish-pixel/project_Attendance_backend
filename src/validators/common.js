import { ApiError } from '../utils/api-error.js';

export const required = (value, name) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new ApiError(400, `${name} is required`);
  }
  return value;
};

export const uuid = (value, name) => required(value, name);
