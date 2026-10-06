export const ok = (res, data, message = undefined) =>
  res.json({ success: true, ...(message ? { message } : {}), data });

export const created = (res, data, message = 'Created') =>
  res.status(201).json({ success: true, message, data });