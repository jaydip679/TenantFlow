'use strict';

const mongoose = require('mongoose');
const AnalyticsProcessedEvent = require('./AnalyticsProcessedEvent.model');

describe('AnalyticsProcessedEvent Model', () => {
  it('should validate required fields', () => {
    const doc = new AnalyticsProcessedEvent();
    const err = doc.validateSync();
    expect(err.errors.eventId).toBeDefined();
    expect(err.errors.eventType).toBeDefined();
  });

  it('should create a valid doc', () => {
    const doc = new AnalyticsProcessedEvent({
      eventId: 'evt-123',
      eventType: 'tenant.created'
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
