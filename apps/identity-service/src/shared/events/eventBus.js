'use strict';

/**
 * EventBus Abstraction
 * 
 * Abstract base class defining the contract for event publishing and subscription.
 * Concrete implementations (e.g., RedisStreamsEventBus) must implement these methods.
 */
class EventBus {
  /**
   * Publish an event to the bus.
   * @param {Object} eventEnvelope - The standardized event envelope object.
   * @param {Object} [options] - Additional options (e.g. specific stream, retry configs).
   * @returns {Promise<string>} The message ID of the published event.
   */
  async publish(eventEnvelope, options = {}) {
    throw new Error('EventBus.publish() not implemented');
  }

  /**
   * Subscribe to events from the bus.
   * @param {Object} options
   * @param {string} options.groupName - The consumer group name (e.g. 'analytics').
   * @param {string} options.consumerName - The unique consumer name (e.g. 'analytics-1').
   * @param {string[]} options.eventTypes - Array of event types this consumer wants to process.
   * @param {Function} options.handler - Async function(eventEnvelope, context).
   * @returns {Promise<void>}
   */
  async subscribe({ groupName, consumerName, eventTypes, handler }) {
    throw new Error('EventBus.subscribe() not implemented');
  }

  /**
   * Close the connection to the event bus.
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('EventBus.close() not implemented');
  }
}

module.exports = { EventBus };
