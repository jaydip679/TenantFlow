'use strict';

/**
 * Invoice Number Generator
 *
 * Generates globally unique, sequential invoice numbers in the format:
 *   INV-{YYYY}-{NNNNN}  e.g. INV-2024-00001
 *
 * Uses MongoDB atomic findOneAndUpdate with $inc — race-condition safe.
 * A single "counters" collection holds the per-year sequence.
 *
 * CRITICAL: Atomic — no two concurrent calls will ever receive the same number.
 *
 * REF: docs/DATABASE_DESIGN.md §8 — Invoice Number Sequence
 */

const mongoose = require('mongoose');

/**
 * Generate the next invoice number for the current calendar year.
 * @returns {Promise<string>} e.g. 'INV-2024-00001'
 */
const generateInvoiceNumber = async () => {
  const year      = new Date().getFullYear();
  const counterId = `invoice_seq_${year}`;

  const result = await mongoose.connection.db.collection('counters').findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  const seq = result.seq;
  return `INV-${year}-${String(seq).padStart(5, '0')}`;
  // e.g. INV-2024-00142
};

module.exports = { generateInvoiceNumber };
