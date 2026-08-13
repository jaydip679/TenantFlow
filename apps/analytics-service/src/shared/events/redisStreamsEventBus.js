'use strict';

const { EventBus } = require('./eventBus');
const redisClient = require('../../config/redis'); // Shared publisher client
const logger = require('../utils/logger');
const { validateEventEnvelope } = require('./eventEnvelope');

/**
 * Redis Streams implementation of EventBus.
 */
class RedisStreamsEventBus extends EventBus {
  constructor() {
    super();
    this.streamName = 'tenantflow:events';
    this.publisher = redisClient;
    this.consumers = []; // Track consumer connections for graceful shutdown
    
    // Auto-claim parameters
    this.minIdleTime = 5 * 60 * 1000; // 5 minutes threshold for pending messages
  }

  /**
   * Publish an event to Redis Streams.
   * Uses the shared Redis client since XADD is non-blocking.
   * 
   * @param {Object} eventEnvelope - The validated event envelope.
   * @returns {Promise<string>} The Redis message ID.
   */
  async publish(eventEnvelope) {
    // Serialize to JSON string under a single 'data' field
    const payload = JSON.stringify(eventEnvelope);
    
    // XADD streamName * data <json>
    const messageId = await this.publisher.xadd(
      this.streamName,
      '*',
      'data',
      payload
    );
    
    logger.debug({ messageId, eventType: eventEnvelope.eventType }, 'Published event to Redis Stream');
    return messageId;
  }

  /**
   * Subscribes to events with auto-ACK and filtering.
   * Uses a dedicated duplicated Redis connection for blocking reads.
   */
  async subscribe({ groupName, consumerName, eventTypes, handler }) {
    // 1. Create a dedicated connection for this consumer
    const consumerClient = this.publisher.duplicate();
    this.consumers.push({ client: consumerClient, active: true, groupName, consumerName });

    consumerClient.on('error', (err) => {
      logger.error({ err: err.message, groupName, consumerName }, 'EventBus consumer client error');
    });

    // 2. Ensure Consumer Group exists
    try {
      await this.publisher.xgroup('CREATE', this.streamName, groupName, '$', 'MKSTREAM');
      logger.info({ groupName }, 'Created Redis Stream consumer group');
    } catch (err) {
      // BUSYGROUP means the group already exists, which is expected
      if (!err.message.includes('BUSYGROUP')) {
        logger.error({ err: err.message, groupName }, 'Failed to create consumer group');
        throw err;
      }
    }

    // Run the reclaim process in background periodically (simple bounding mechanism)
    // In Phase 1B, this proves we can recover messages. Real DLQ is deferred.
    this._startReclaimer(consumerClient, groupName, consumerName, eventTypes, handler);

    // 3. Start consuming loop
    this._startConsumerLoop(consumerClient, groupName, consumerName, eventTypes, handler);
    
    logger.info({ groupName, consumerName, eventTypes }, 'Subscribed to EventBus');
  }

  /**
   * Internal consuming loop.
   */
  async _startConsumerLoop(consumerClient, groupName, consumerName, eventTypes, handler) {
    const consumerState = this.consumers.find(c => c.client === consumerClient);
    
    while (consumerState && consumerState.active) {
      try {
        // XREADGROUP GROUP group consumer BLOCK 5000 COUNT 10 STREAMS stream >
        const results = await consumerClient.xreadgroup(
          'GROUP', groupName, consumerName,
          'BLOCK', 5000,
          'COUNT', 10,
          'STREAMS', this.streamName,
          '>'
        );

        if (results) {
          const [streamData] = results;
          const messages = streamData[1];

          for (const message of messages) {
            await this._processMessage(consumerClient, groupName, message, eventTypes, handler);
          }
        }
      } catch (err) {
        if (err.message.includes('Connection is closed')) {
          break; // Exit loop on close
        }
        logger.error({ err: err.message, groupName, consumerName }, 'Error reading from stream');
        // Backoff slightly on error
        await new Promise(res => setTimeout(res, 2000));
      }
    }
  }

  /**
   * Periodically reclaims pending messages that exceeded minIdleTime.
   */
  async _startReclaimer(consumerClient, groupName, consumerName, eventTypes, handler) {
    const consumerState = this.consumers.find(c => c.client === consumerClient);
    
    while (consumerState && consumerState.active) {
      try {
        // XAUTOCLAIM stream group consumer min-idle-time start COUNT count
        // Start at 0-0 for iterating PEL
        const result = await consumerClient.xautoclaim(
          this.streamName,
          groupName,
          consumerName,
          this.minIdleTime,
          '0-0',
          'COUNT', 10
        );
        
        if (result && result[1] && result[1].length > 0) {
          const claimedMessages = result[1];
          logger.info({ count: claimedMessages.length, groupName, consumerName }, 'Claimed pending messages');
          
          for (const message of claimedMessages) {
            await this._processMessage(consumerClient, groupName, message, eventTypes, handler);
          }
        }
      } catch (err) {
        if (!err.message.includes('Connection is closed')) {
          logger.error({ err: err.message, groupName, consumerName }, 'Error reclaiming pending messages');
        }
      }
      // Run reclaim every minute
      await new Promise(res => setTimeout(res, 60000));
    }
  }

  /**
   * Process a single message, handle validation, poison messages, and ACKing.
   */
  async _processMessage(consumerClient, groupName, message, eventTypes, handler) {
    const messageId = message[0];
    const fields = message[1];
    
    // Redis streams fields are alternating keys/values
    const dataIndex = fields.indexOf('data');
    if (dataIndex === -1 || !fields[dataIndex + 1]) {
      // Poison message: no data field
      logger.error({ messageId, groupName }, 'Poison message: missing data field. ACKing to prevent infinite loop.');
      await consumerClient.xack(this.streamName, groupName, messageId);
      return;
    }

    const jsonStr = fields[dataIndex + 1];
    let envelope;
    try {
      const parsed = JSON.parse(jsonStr);
      envelope = validateEventEnvelope(parsed);
    } catch (err) {
      // Poison message: malformed JSON or failed envelope validation
      logger.error({ messageId, groupName, err: err.message }, 'Poison message: invalid payload/envelope. ACKing to prevent infinite loop.');
      await consumerClient.xack(this.streamName, groupName, messageId);
      return;
    }

    // Filter event type
    if (!eventTypes.includes(envelope.eventType)) {
      // Message is not meant for this consumer, silently ACK and skip
      await consumerClient.xack(this.streamName, groupName, messageId);
      return;
    }

    // Invoke handler
    try {
      await handler(envelope, { messageId });
      // ONLY ACK after successful execution
      await consumerClient.xack(this.streamName, groupName, messageId);
    } catch (err) {
      // Handler failed. DO NOT ACK. Message remains in PEL.
      logger.error({ err: err.message, messageId, eventId: envelope.eventId, groupName }, 'Event handler failed. Message left in PEL.');
    }
  }

  /**
   * Graceful shutdown of all consumer connections.
   */
  async close() {
    logger.info(`Closing ${this.consumers.length} EventBus consumer connections...`);
    for (const consumer of this.consumers) {
      consumer.active = false; // Stop loops
      try {
        // disconnect() is used instead of quit() because quit() will queue behind a blocking XREADGROUP
        consumer.client.disconnect();
      } catch (err) {
        logger.warn({ err: err.message }, 'Error closing consumer connection');
      }
    }
    this.consumers = [];
  }
}

module.exports = { RedisStreamsEventBus };
