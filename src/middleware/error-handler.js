export default (error, req, res, next) => {
  console.error(error);

  if (error.code === 'P2002') {
    return res.status(409).json({ message: 'A unique value already exists' });
  }

  if (error.code === 'P2003') {
    return res.status(409).json({
      message: 'This record is in use by other records and cannot be changed or deleted',
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({ message: 'Record not found' });
  }

  const status = error.status || 500;
  res.status(status).json({
    message: status === 500 ? 'Internal server error' : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
};