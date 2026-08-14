'use strict';

const mongoose = require('mongoose');
const Tenant = require('../../../models/Tenant.model');
const ProcessedEvent = require('../../../models/ProcessedEvent.model');
const OutboxEvent = require('../../../models/OutboxEvent.model');
const { startTenantConsumer, stopTenantConsumer } = require('./tenant.consumer');
const { RedisStreamsEventBus } = require('../../../shared/events/redisStreamsEventBus');

let mockHandlerMap = {};

jest.mock('../../../shared/events/redisStreamsEventBus', () => {
  return {
    RedisStreamsEventBus: jest.fn().mockImplementation(() => ({
      subscribe: jest.fn().mockImplementation(async ({ eventTypes, handler }) => {
        for (const type of eventTypes) {
          mockHandlerMap[type] = handler;
        }
      }),
      close: jest.fn(),
    })),
  };
});

jest.setTimeout(30000);

describe('Identity Tenant Consumer', () => {
  let mockEventBus;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tenantflow_test');
    }
  });

  beforeEach(async () => {
    await Tenant.deleteMany({});
    await ProcessedEvent.deleteMany({});
    await OutboxEvent.deleteMany({});
    mockHandlerMap = {};
    
    // Re-import after reset to ensure it uses the fresh map if needed
    const { startTenantConsumer } = require('./tenant.consumer');
    await startTenantConsumer();
  });

  afterEach(async () => {
    await stopTenantConsumer();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  const generateEnvelope = (eventType, payload, tenantId) => ({
    eventId: new mongoose.Types.ObjectId().toString(),
    eventType,
    eventVersion: 'v1',
    occurredAt: new Date(),
    tenantId,
    producer: 'test',
    aggregateType: 'test',
    aggregateId: 'test',
    correlationId: 'test',
    payload,
  });

  const createTestTenant = async (status) => {
    return await Tenant.create({
      name: 'Test Tenant',
      slug: `test-tenant-${Date.now()}-${Math.random()}`,
      billingEmail: 'billing@test.com',
      ownerId: new mongoose.Types.ObjectId(),
      status,
    });
  };

  it('1 & 7. Same event delivered twice sequentially -> transition only once and safely ACK', async () => {
    const tenant = await createTestTenant('active');
    const envelope = generateEnvelope('dunning.abandoned', { dunningRecordId: 'dr-123' }, tenant._id.toString());
    const handler = mockHandlerMap['dunning.abandoned'];

    // First delivery
    await handler(envelope);
    const updated1 = await Tenant.findById(tenant._id);
    expect(updated1.status).toBe('suspended');
    
    // OutboxEvent tenant.suspended should be created
    const outboxEvents = await OutboxEvent.find({ eventType: 'tenant.suspended' });
    expect(outboxEvents.length).toBe(1);
    expect(outboxEvents[0].payload.aggregateVersion).toBeDefined();

    // Second delivery (duplicate)
    await handler(envelope);
    const updated2 = await Tenant.findById(tenant._id);
    expect(updated2.status).toBe('suspended'); // Still suspended
    
    // OutboxEvent should NOT be created again
    const outboxEvents2 = await OutboxEvent.find({ eventType: 'tenant.suspended' });
    expect(outboxEvents2.length).toBe(1);

    const processed = await ProcessedEvent.find({ eventId: envelope.eventId });
    expect(processed.length).toBe(1);
  });

  it('2. Same event delivered concurrently -> only one consumer performs state transition', async () => {
    const tenant = await createTestTenant('past_due');
    const envelope = generateEnvelope('invoice.paid', { invoiceId: 'inv-123', paymentId: 'pay-123' }, tenant._id.toString());
    const handler = mockHandlerMap['invoice.paid'];

    // Concurrent deliveries
    await Promise.allSettled([
      handler(envelope),
      handler(envelope),
      handler(envelope),
    ]);

    const processed = await ProcessedEvent.find({ eventId: envelope.eventId });
    expect(processed.length).toBe(1); // Only one success

    const outboxEvents = await OutboxEvent.find({ eventType: 'tenant.restored' });
    expect(outboxEvents.length).toBe(1);
    expect(outboxEvents[0].payload.aggregateVersion).toBeDefined(); // Only emitted once
  });

  it('3. Tenant update succeeds but processed-event insert fails -> entire Identity transaction rolls back', async () => {
    const tenant = await createTestTenant('active');
    const envelope = generateEnvelope('dunning.abandoned', { dunningRecordId: 'dr-123' }, tenant._id.toString());
    const handler = mockHandlerMap['dunning.abandoned'];

    // Mock ProcessedEvent.create to fail on first attempt
    const originalCreate = ProcessedEvent.create.bind(ProcessedEvent);
    ProcessedEvent.create = jest.fn().mockRejectedValueOnce(new Error('Simulated DB failure'));

    await expect(handler(envelope)).rejects.toThrow('Simulated DB failure');

    // Verify rollback
    const updated = await Tenant.findById(tenant._id);
    expect(updated.status).toBe('active'); // Not suspended!

    const outboxEvents = await OutboxEvent.find({ eventType: 'tenant.suspended' });
    expect(outboxEvents.length).toBe(0); // Not emitted

    // Restore mock
    ProcessedEvent.create = originalCreate;
  });

  it('4. Processed-event insert succeeds but Tenant update fails -> entire Identity transaction rolls back', async () => {
    const tenant = await createTestTenant('active');
    const envelope = generateEnvelope('dunning.abandoned', { dunningRecordId: 'dr-123' }, tenant._id.toString());
    const handler = mockHandlerMap['dunning.abandoned'];

    // Mock Tenant.prototype.save to fail
    const originalSave = Tenant.prototype.save;
    Tenant.prototype.save = jest.fn().mockRejectedValueOnce(new Error('Simulated Tenant save failure'));

    await expect(handler(envelope)).rejects.toThrow('Simulated Tenant save failure');

    // Verify rollback
    const processed = await ProcessedEvent.find({ eventId: envelope.eventId });
    expect(processed.length).toBe(0); // Insert rolled back!

    const outboxEvents = await OutboxEvent.find({ eventType: 'tenant.suspended' });
    expect(outboxEvents.length).toBe(0); // Not emitted

    // Restore mock
    Tenant.prototype.save = originalSave;
  });

  it('6. Retry after rollback -> event eventually processes successfully', async () => {
    const tenant = await createTestTenant('active');
    const envelope = generateEnvelope('dunning.abandoned', { dunningRecordId: 'dr-123' }, tenant._id.toString());
    const handler = mockHandlerMap['dunning.abandoned'];

    // Force first attempt to fail
    const originalSave = Tenant.prototype.save;
    Tenant.prototype.save = jest.fn().mockRejectedValueOnce(new Error('Transient failure'));

    await expect(handler(envelope)).rejects.toThrow('Transient failure');

    // Second attempt succeeds
    Tenant.prototype.save = originalSave;
    await handler(envelope);

    const updated = await Tenant.findById(tenant._id);
    expect(updated.status).toBe('suspended');

    const processed = await ProcessedEvent.find({ eventId: envelope.eventId });
    expect(processed.length).toBe(1);

    const outboxEvents = await OutboxEvent.find({ eventType: 'tenant.suspended' });
    expect(outboxEvents.length).toBe(1);
  });
});
