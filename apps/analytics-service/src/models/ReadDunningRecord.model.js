'use strict';

const mongoose = require('mongoose');

const readDunningRecordSchema = new mongoose.Schema(
  {
    dunningRecordId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    invoiceId: { type: String, required: true },
    subscriptionId: { type: String, required: true },
    invoiceAmount: { type: Number, required: true },
    status: { type: String, required: true },
    aggregateVersion: { type: Number, required: true, default: 1 },
  },
  {
    timestamps: true,
    collection: 'analytics_read_dunning_records',
  }
);

module.exports = mongoose.model('ReadDunningRecord', readDunningRecordSchema);
