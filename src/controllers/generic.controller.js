import prisma from '../lib/prisma.js';

export const factory = (model) => ({
  list: async (req, res) => {
    // Check if model exists in prisma
    if (!prisma[model]) {
      throw new Error(`Model "${model}" does not exist in Prisma client`);
    }
    
    res.json({
      data: await prisma[model].findMany(),
    });
  },
  
  get: async (req, res) =>
    res.json({
      data: await prisma[model].findUniqueOrThrow({
        where: { id: req.params.id },
      }),
    }),

  create: async (req, res) =>
    res
      .status(201)
      .json({ data: await prisma[model].create({ data: req.body }) }),

  update: async (req, res) =>
    res.json({
      data: await prisma[model].update({
        where: { id: req.params.id },
        data: req.body,
      }),
    }),

  remove: async (req, res) =>
    res.json({
      data: await prisma[model].delete({ where: { id: req.params.id } }),
    }),
});