'use strict';

const mongoose = require('mongoose');
const Tenant = require('../../models/Tenant.model');
const AuditLog = require('../../models/AuditLog.model');
const { AppError } = require('../../shared/errors/AppError');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');
const logger = require('../../shared/utils/logger');
const { addEventToOutbox } = require('../../shared/events/outbox.helper');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const forceStatusChange = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { status, reason } = req.body;
  const actorId = req.user.userId;

  const VALID_STATUSES = ['active', 'suspended', 'cancelled', 'trialing'];
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(`Invalid status: ${status}.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { status, updatedAt: new Date() },
      { new: true, session }
    );

    if (!tenant) {
      throw new AppError('Tenant not found.', 404, ERROR_CODES.TENANT_NOT_FOUND);
    }

    // Create audit log
    await AuditLog.create([{
      event:        'tenant.status_changed',
      tenantId:     tenantId,
      actor:        { userId: actorId, role: 'super_admin' },
      resourceType: 'Tenant',
      resourceId:   tenantId,
      source:       'admin_override',
      metadata:     { newStatus: status, reason },
    }], { session });

    await addEventToOutbox({
      eventType: 'tenant.status_changed',
      tenantId,
      aggregateType: 'tenant',
      aggregateId: tenantId,
      payload: {
        status,
        reason,
        actorId,
        source: 'admin_override'
      },
      session
    });

    await session.commitTransaction();
    logger.info({ tenantId, status, reason, actorId }, 'Admin force-status-change applied');
    res.status(200).json({ success: true, data: { tenant } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

module.exports = { forceStatusChange };
