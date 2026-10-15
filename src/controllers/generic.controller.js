import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

// Copy only whitelisted fields from the request body so clients cannot write
// arbitrary columns (ids, timestamps, relations...).
const pick = (body, fields) => {
  if (!fields) return body;
  const out = {};
  for (const f of fields) if (body?.[f] !== undefined) out[f] = body[f];
  return out;
};

export const factory = (model, { fields } = {}) => ({
  list: async (req, res) => {
    if (!prisma[model]) {
      throw new Error(`Model "${model}" does not exist in Prisma client`);
    }
    res.json({ data: await prisma[model].findMany() });
  },

  get: async (req, res) =>
    res.json({
      data: await prisma[model].findUniqueOrThrow({ where: { id: req.params.id } }),
    }),

  create: async (req, res) => {
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) throw new ApiError(400, 'No valid fields supplied');
    res.status(201).json({ data: await prisma[model].create({ data }) });
  },

  update: async (req, res) => {
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) throw new ApiError(400, 'No valid fields supplied');
    res.json({ data: await prisma[model].update({ where: { id: req.params.id }, data }) });
  },

  remove: async (req, res) =>
    res.json({ data: await prisma[model].delete({ where: { id: req.params.id } }) }),
});
