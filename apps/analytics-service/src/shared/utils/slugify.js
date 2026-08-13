'use strict';

/**
 * Slugify Utility
 *
 * Generates URL-safe slugs from company names.
 * Ensures uniqueness by appending -2, -3, etc. on collisions.
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.5
 */

/**
 * Convert a string to a URL-safe slug.
 * - Lowercase
 * - Replace spaces and special chars with hyphens
 * - Remove consecutive/leading/trailing hyphens
 *
 * @param {string} name
 * @returns {string}
 */
const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Generate a unique slug for a Tenant.
 * Checks the DB for collisions and appends incrementing suffixes.
 *
 * @param {string} name          - Raw company name
 * @param {import('mongoose').Model} TenantModel
 * @returns {Promise<string>}
 */
const generateSlug = async (name, TenantModel) => {
  const base = slugify(name);
  let candidate = base;
  let counter   = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await TenantModel.findOne({ slug: candidate }).lean();
    if (!exists) return candidate;
    candidate = `${base}-${counter}`;
    counter++;
  }
};

module.exports = { slugify, generateSlug };
