/**
 * MongoDB Initialization Script
 *
 * Executed once when the MongoDB container is first created.
 * Creates the tenantflow database, sets up initial collections,
 * and creates the counters document for invoice number sequencing.
 *
 * REF: docs/DATABASE_DESIGN.md §8 — Invoice Number Sequence
 */

// Switch to the tenantflow database
db = db.getSiblingDB('tenantflow');

// Create the counters collection for sequential invoice numbers
// Format: INV-{YEAR}-{5-digit-seq}
// REF: docs/DATABASE_DESIGN.md §8
db.counters.insertOne({
  _id: 'invoice_seq_' + new Date().getFullYear(),
  seq: 0,
});

print('MongoDB initialized: tenantflow database ready');
print('Counters collection seeded with invoice sequence');
