'use strict';

const mongoose = require('mongoose');
const OutboxEvent = require('../models/OutboxEvent.model');
jest.mock('../shared/events/redisStreamsEventBus', () => {
  const publish = jest.fn().mockResolvedValue('msg-123');
  return {
    RedisStreamsEventBus: jest.fn().mockImplementation(() => ({
      publish,
      close: jest.fn(),
    })),
    __mockPublish: publish
  };
});

const { __mockPublish: mockPublish } = require('../shared/events/redisStreamsEventBus');
const { startPublisher, stopPublisher } = require('./outbox.publisher');

jest.setTimeout(30000);

describe('Outbox Publisher Daemon', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tenantflow_test');
    }
  }, 30000);

  beforeEach(async () => {
    await OutboxEvent.deleteMany({});
    mockPublish.mockReset();
    mockPublish.mockResolvedValue('msg-123');
  }, 30000);

  afterEach(async () => {
    await stopPublisher();
    jest.clearAllMocks();
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
  }, 30000);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it('claims pending events and successfully publishes them', async () => {
    const event = await OutboxEvent.create({
      eventId: new mongoose.Types.ObjectId().toString(),
      eventType: 'test.event',
      eventVersion: 'v1',
      producer: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' },
      occurredAt: new Date(),
    });

    startPublisher();
    
    // Wait for polling interval
    await sleep(2100);

    const updatedEvent = await OutboxEvent.findById(event._id);
    expect(updatedEvent.status).toBe('published');
    expect(updatedEvent.leaseUntil).toBeNull();
    
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({
      eventId: event.eventId,
      eventType: 'test.event',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' }
    }));
  });

  it('ignores events locked by another process (leaseUntil in the future)', async () => {
    const futureDate = new Date(Date.now() + 60000); // 1 min in future
    const event = await OutboxEvent.create({
      eventId: new mongoose.Types.ObjectId().toString(),
      eventType: 'test.event',
      producer: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' },
      occurredAt: new Date(),
      status: 'publishing',
      leaseUntil: futureDate,
    });

    startPublisher();
    await sleep(2100);

    const updatedEvent = await OutboxEvent.findById(event._id);
    expect(updatedEvent.status).toBe('publishing'); // Unchanged
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('reclaims publishing events if lease has expired', async () => {
    const pastDate = new Date(Date.now() - 60000); // 1 min in past
    const event = await OutboxEvent.create({
      eventId: new mongoose.Types.ObjectId().toString(),
      eventType: 'test.event',
      eventVersion: 'v1',
      producer: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' },
      occurredAt: new Date(),
      status: 'publishing',
      leaseUntil: pastDate,
    });

    startPublisher();
    await sleep(2100);

    const updatedEvent = await OutboxEvent.findById(event._id);
    expect(updatedEvent.status).toBe('published');
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim publishing events with active lease', async () => {
    const activeLease = new Date(Date.now() + 10000); // 10 sec in future
    const event = await OutboxEvent.create({
      eventId: new mongoose.Types.ObjectId().toString(),
      eventType: 'test.event',
      eventVersion: 'v1',
      producer: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' },
      occurredAt: new Date(),
      status: 'publishing',
      leaseUntil: activeLease,
    });

    startPublisher();
    await sleep(2100);

    const updatedEvent = await OutboxEvent.findById(event._id);
    expect(updatedEvent.status).toBe('publishing');
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('retries on failure and eventually marks as failed after MAX_ATTEMPTS', async () => {
    // Simulate permanent failure
    mockPublish.mockRejectedValue(new Error('Simulated publish failure'));

    const event = await OutboxEvent.create({
      eventId: new mongoose.Types.ObjectId().toString(),
      eventType: 'test.fail',
      eventVersion: 'v1',
      producer: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: { foo: 'bar' },
      occurredAt: new Date(),
      status: 'pending',
      attempts: 4, // Next failure will hit max attempts (5)
    });

    startPublisher();
    await sleep(2100);

    const updatedEvent = await OutboxEvent.findById(event._id);
    expect(updatedEvent.status).toBe('failed');
    expect(updatedEvent.attempts).toBe(5);
    expect(updatedEvent.availableAt).toBeNull();
    expect(updatedEvent.leaseUntil).toBeNull();
  });
});
