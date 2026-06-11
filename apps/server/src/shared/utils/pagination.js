'use strict';

/**
 * Pagination Utility
 *
 * Standard pagination helpers used across all list endpoints.
 * All list endpoints use cursor-based or offset pagination.
 *
 * Default: page=1, limit=20, max limit=100
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.5
 * REF: docs/SRS.md §17.2 — Pagination schema component
 */

const DEFAULT_PAGE  = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 100;

/**
 * Parse and sanitize pagination parameters from query string.
 *
 * @param {{ page?: string|number, limit?: string|number }} query
 * @returns {{ page: number, limit: number, skip: number }}
 */
const parsePagination = (query = {}) => {
  const page  = Math.max(1, parseInt(query.page, 10)  || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build standard pagination metadata for API responses.
 *
 * @param {number} total   - Total document count from DB
 * @param {number} page    - Current page
 * @param {number} limit   - Items per page
 * @returns {{ total: number, page: number, limit: number, totalPages: number, hasNext: boolean, hasPrev: boolean }}
 */
const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNext:    page * limit < total,
  hasPrev:    page > 1,
});

/**
 * Apply pagination to a Mongoose query and return results + meta.
 * Usage:
 *   const { data, pagination } = await paginate(
 *     Plan.find({ isActive: true }),
 *     { page: 1, limit: 20 }
 *   );
 *
 * @param {import('mongoose').Query} mongooseQuery - Chainable Mongoose query (not yet executed)
 * @param {{ page?: number, limit?: number }} options
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
const paginate = async (mongooseQuery, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  // Clone query for count (before skip/limit are applied)
  const countQuery = mongooseQuery.model.countDocuments(mongooseQuery.getFilter());

  const [total, data] = await Promise.all([
    countQuery,
    mongooseQuery.skip(skip).limit(limit),
  ]);

  return {
    data,
    pagination: paginationMeta(total, page, limit),
  };
};

module.exports = { parsePagination, paginationMeta, paginate };
