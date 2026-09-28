export const ok = (res, data, meta) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
};

export const created = (res, data) => res.status(201).json({ success: true, data });

export const noContent = (res) => res.status(204).end();

export const paginated = (res, { rows, count }, { page, limit }) =>
  ok(res, rows, {
    page,
    limit,
    total: count,
    totalPages: Math.ceil(count / limit) || 0,
  });
