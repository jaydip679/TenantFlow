'use strict';

const ReadSubscription = require('../models/ReadSubscription.model');
const logger = require('../shared/utils/logger');

const handleSubscriptionCreated = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const existing = await ReadSubscription.findOne({ subscriptionId: payload.subscriptionId }).session(session);
  if (!existing) {
    await ReadSubscription.create(
      [
        {
          subscriptionId: payload.subscriptionId,
          tenantId,
          planId: payload.planId,
          status: payload.status,
          seatCount: payload.seatCount,
          currentPeriodEnd: payload.currentPeriodEnd,
          cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
          planName: payload.planName,
          planPrice: payload.planPrice,
          planInterval: payload.planInterval,
          currency: payload.currency,
          maxSeats: payload.maxSeats,
          aggregateVersion: payload.aggregateVersion,
        },
      ],
      { session }
    );
  } else if (payload.aggregateVersion > existing.aggregateVersion) {
    existing.tenantId = tenantId;
    existing.planId = payload.planId;
    existing.status = payload.status;
    existing.seatCount = payload.seatCount;
    existing.currentPeriodEnd = payload.currentPeriodEnd;
    existing.cancelAtPeriodEnd = payload.cancelAtPeriodEnd;
    existing.planName = payload.planName;
    existing.planPrice = payload.planPrice;
    existing.planInterval = payload.planInterval;
    existing.currency = payload.currency;
    existing.maxSeats = payload.maxSeats;
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  }
};

const handleSubscriptionUpgraded = async (envelope, session) => {
  const { payload } = envelope;

  const existing = await ReadSubscription.findOne({ subscriptionId: payload.subscriptionId }).session(session);
  if (existing && payload.aggregateVersion > existing.aggregateVersion) {
    existing.planId = payload.newPlanId;
    existing.seatCount = payload.seatCount;
    existing.currentPeriodEnd = payload.currentPeriodEnd;
    existing.cancelAtPeriodEnd = payload.cancelAtPeriodEnd;
    if (payload.planName !== undefined) existing.planName = payload.planName;
    if (payload.planPrice !== undefined) existing.planPrice = payload.planPrice;
    if (payload.planInterval !== undefined) existing.planInterval = payload.planInterval;
    if (payload.currency !== undefined) existing.currency = payload.currency;
    if (payload.features && payload.features.max_seats !== undefined) {
      existing.maxSeats = payload.features.max_seats;
    }
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  } else if (!existing) {
    logger.warn({ subscriptionId: payload.subscriptionId }, 'Received subscription.upgraded for unknown subscription');
  }
};

const handleSubscriptionRenewed = async (envelope, session) => {
  const { payload } = envelope;

  const existing = await ReadSubscription.findOne({ subscriptionId: payload.subscriptionId }).session(session);
  if (existing && payload.aggregateVersion > existing.aggregateVersion) {
    existing.status = payload.status;
    // model schema only has currentPeriodEnd but payload has currentPeriodStart and End. We update what we have.
    existing.currentPeriodEnd = payload.currentPeriodEnd;
    existing.seatCount = payload.seatCount;
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  } else if (!existing) {
    logger.warn({ subscriptionId: payload.subscriptionId }, 'Received subscription.renewed for unknown subscription');
  }
};

const handleSubscriptionCancelled = async (envelope, session) => {
  const { payload } = envelope;

  const existing = await ReadSubscription.findOne({ subscriptionId: payload.subscriptionId }).session(session);
  if (existing && payload.aggregateVersion > existing.aggregateVersion) {
    existing.cancelAtPeriodEnd = payload.cancelAtPeriodEnd;
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  } else if (!existing) {
    logger.warn({ subscriptionId: payload.subscriptionId }, 'Received subscription.cancelled for unknown subscription');
  }
};

module.exports = {
  handleSubscriptionCreated,
  handleSubscriptionUpgraded,
  handleSubscriptionRenewed,
  handleSubscriptionCancelled,
};
