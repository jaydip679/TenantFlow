'use strict';

const { RedisStreamsEventBus } = require('./redisStreamsEventBus');
const { createEventEnvelope } = require('./eventEnvelope');
const redisClient = require('../../config/redis');

describe.skip('RedisStreamsEventBus Integration', () => {
  let eventBus;
  const streamName = 'tenantflow:events';
  
  beforeAll(async () => {
    // Clean up any previous test stream
    await redisClient.del(streamName);
  });

  beforeEach(() => {
    eventBus = new RedisStreamsEventBus();
  });

  afterEach(async () => {
    await eventBus.close();
  });

  afterAll(async () => {
    await redisClient.del(streamName);
  });

  it('1. publish() generates messageId and stores valid envelope', async () => {
    const envelope = createEventEnvelope({
      eventType: 'test.event',
      eventVersion: 'v1',
      payload: { test: true }
    });

    const msgId = await eventBus.publish(envelope);
    expect(msgId).toBeDefined();

    // Verify it's in Redis
    const stream = await redisClient.xrange(streamName, '-', '+');
    expect(stream.length).toBeGreaterThan(0);
    
    // Find the published message
    const msg = stream.find(m => m[0] === msgId);
    expect(msg).toBeDefined();
    
    const fields = msg[1];
    const dataIdx = fields.indexOf('data');
    const parsedData = JSON.parse(fields[dataIdx + 1]);
    
    expect(parsedData.eventId).toBe(envelope.eventId);
    expect(parsedData.eventType).toBe('test.event');
    expect(parsedData.producer).toBe('tenantflow-server');
  });

  it('2. subscribe() receives events and auto-ACKs on success', async () => {
    const envelope = createEventEnvelope({
      eventType: 'auto.ack.event',
      eventVersion: 'v1',
      payload: { ackMe: true }
    });

    const handler = jest.fn().mockResolvedValue(true);
    
    await eventBus.subscribe({
      groupName: 'test-group-ack',
      consumerName: 'consumer-1',
      eventTypes: ['auto.ack.event'],
      handler
    });

    await new Promise(r => setTimeout(r, 200));

    const msgId = await eventBus.publish(envelope);

    // Wait a moment for consumer loop to pick it up
    await new Promise(r => setTimeout(r, 1000));

    expect(handler).toHaveBeenCalledTimes(1);
    const calledEnvelope = handler.mock.calls[0][0];
    expect(calledEnvelope.eventId).toBe(envelope.eventId);

    // Verify it was ACKed (pending list should be empty)
    const pending = await redisClient.xpending(streamName, 'test-group-ack');
    expect(pending[0]).toBe(0); // 0 pending messages
  });

  it('3. subscribe() does NOT ACK when handler fails', async () => {
    const envelope = createEventEnvelope({
      eventType: 'fail.ack.event',
      eventVersion: 'v1',
      payload: { failMe: true }
    });

    const handler = jest.fn().mockRejectedValue(new Error('Simulated failure'));
    
    await eventBus.subscribe({
      groupName: 'test-group-fail',
      consumerName: 'consumer-1',
      eventTypes: ['fail.ack.event'],
      handler
    });

    await new Promise(r => setTimeout(r, 200));

    const msgId = await eventBus.publish(envelope);

    await new Promise(r => setTimeout(r, 1000));

    expect(handler).toHaveBeenCalledTimes(1);

    // Verify it was NOT ACKed (pending list should have 1)
    const pending = await redisClient.xpending(streamName, 'test-group-fail');
    expect(pending[0]).toBe(1); // 1 pending message
  });

  it('4. Event type filtering ignores unrelated events and auto-ACKs them', async () => {
    const envelope = createEventEnvelope({
      eventType: 'unrelated.event',
      eventVersion: 'v1',
      payload: { ignoreMe: true }
    });

    const handler = jest.fn();
    
    await eventBus.subscribe({
      groupName: 'test-group-filter',
      consumerName: 'consumer-1',
      eventTypes: ['wanted.event'],
      handler
    });

    await new Promise(r => setTimeout(r, 200));

    await eventBus.publish(envelope);

    await new Promise(r => setTimeout(r, 1000));

    expect(handler).not.toHaveBeenCalled();

    // Verify it was silently ACKed to prevent blocking PEL
    const pending = await redisClient.xpending(streamName, 'test-group-filter');
    expect(pending[0]).toBe(0);
  });

  it('5. Poison message handling (malformed JSON) safely ACKs and skips', async () => {
    // Create group manually first
    try {
      await redisClient.xgroup('CREATE', streamName, 'test-group-poison', '$', 'MKSTREAM');
    } catch(e) {}

    // Manually push bad JSON
    await redisClient.xadd(streamName, '*', 'data', '{ bad json');

    const handler = jest.fn();
    
    await eventBus.subscribe({
      groupName: 'test-group-poison',
      consumerName: 'consumer-1',
      eventTypes: ['wanted.event'],
      handler
    });

    await new Promise(r => setTimeout(r, 1000));

    expect(handler).not.toHaveBeenCalled();

    // Should be ACKed (pending = 0)
    const pending = await redisClient.xpending(streamName, 'test-group-poison');
    expect(pending[0]).toBe(0);
  });

  it('6. Multiple consumer groups independently receive the same event', async () => {
    const envelope = createEventEnvelope({
      eventType: 'multi.group.event',
      eventVersion: 'v1',
      payload: { broadcast: true }
    });

    const handler1 = jest.fn().mockResolvedValue(true);
    const handler2 = jest.fn().mockResolvedValue(true);

    // Subscribe both first so they establish their groups and pointers
    await eventBus.subscribe({
      groupName: 'group-a',
      consumerName: 'consumer-a',
      eventTypes: ['multi.group.event'],
      handler: handler1
    });

    await eventBus.subscribe({
      groupName: 'group-b',
      consumerName: 'consumer-b',
      eventTypes: ['multi.group.event'],
      handler: handler2
    });

    // Now publish
    await eventBus.publish(envelope);

    await new Promise(r => setTimeout(r, 1000));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });
});
