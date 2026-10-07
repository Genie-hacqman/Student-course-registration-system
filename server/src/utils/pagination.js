export const buildPagination = ({ page = 1, limit = 20, sort } = {}, allowedSort = [], defaultSort = ['id', 'ASC']) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  let order = [defaultSort];
  if (sort) {
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    if (allowedSort.includes(field)) order = [[field, desc ? 'DESC' : 'ASC']];
  }

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    order,
  };
};
