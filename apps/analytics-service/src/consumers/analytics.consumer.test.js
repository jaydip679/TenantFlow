'use strict';

const mongoose = require('mongoose');
const { handleAnalyticsEvent } = require('./analytics.consumer');
const AnalyticsProcessedEvent = require('../models/AnalyticsProcessedEvent.model');
const ReadTenant = require('../models/ReadTenant.model');
const ReadSubscription = require('../models/ReadSubscription.model');
const ReadInvoice = require('../models/ReadInvoice.model');
const TenantEngagementMetrics = require('../models/TenantEngagementMetrics.model');

describe('Analytics Consumer and Projections', () => {
  jest.setTimeout(30000);
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI;
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterEach(async () => {
    await AnalyticsProcessedEvent.deleteMany({});
    await ReadTenant.deleteMany({});
    await ReadSubscription.deleteMany({});
    await ReadInvoice.deleteMany({});
    await TenantEngagementMetrics.deleteMany({});
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

  describe('Tenant Projection', () => {
    it('creates ReadTenant and TenantEngagementMetrics on tenant.created', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const envelope = generateEnvelope('tenant.created', {
        name: 'Test Tenant',
        slug: 'test-tenant',
        email: 'owner@test.com',
        createdAt: new Date(),
        aggregateVersion: 1,
      }, tenantId);

      await handleAnalyticsEvent(envelope);

      const tenant = await ReadTenant.findOne({ tenantId });
      expect(tenant).toBeTruthy();
      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.ownerEmail).toBe('owner@test.com');
      expect(tenant.status).toBe('active');
      expect(tenant.aggregateVersion).toBe(1);

      const metrics = await TenantEngagementMetrics.findOne({ tenantId });
      expect(metrics).toBeTruthy();
      expect(metrics.totalLogins).toBe(0);
    });

    it('updates tenant status and ignores older versions', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const createdEnv = generateEnvelope('tenant.created', { name: 'T1', slug: 't1', email: 'o@t.com', createdAt: new Date(), aggregateVersion: 1 }, tenantId);
      await handleAnalyticsEvent(createdEnv);

      // Suspend with version 2
      const suspendedEnv = generateEnvelope('tenant.suspended', { aggregateVersion: 2 }, tenantId);
      await handleAnalyticsEvent(suspendedEnv);

      let tenant = await ReadTenant.findOne({ tenantId });
      expect(tenant.status).toBe('suspended');
      expect(tenant.aggregateVersion).toBe(2);

      // Attempt to restore with version 1 (Older version should be ignored)
      const restoredEnvOld = generateEnvelope('tenant.restored', { aggregateVersion: 1 }, tenantId);
      await handleAnalyticsEvent(restoredEnvOld);

      tenant = await ReadTenant.findOne({ tenantId });
      expect(tenant.status).toBe('suspended'); // Still suspended
      expect(tenant.aggregateVersion).toBe(2);
    });
  });

  describe('Subscription Projection', () => {
    it('creates and upgrades subscription with snapshot data', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const subscriptionId = new mongoose.Types.ObjectId().toString();

      const createdEnv = generateEnvelope('subscription.created', {
        subscriptionId,
        planId: 'plan1',
        status: 'trialing',
        seatCount: 5,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        planPrice: 1000,
        planInterval: 'monthly',
        currency: 'INR',
        aggregateVersion: 1,
      }, tenantId);

      await handleAnalyticsEvent(createdEnv);

      let sub = await ReadSubscription.findOne({ subscriptionId });
      expect(sub.status).toBe('trialing');
      expect(sub.planId).toBe('plan1');
      expect(sub.seatCount).toBe(5);

      const upgradedEnv = generateEnvelope('subscription.upgraded', {
        subscriptionId,
        oldPlanId: 'plan1',
        newPlanId: 'plan2',
        seatCount: 10,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        planPrice: 2000,
        planInterval: 'monthly',
        currency: 'INR',
        aggregateVersion: 2,
      }, tenantId);

      await handleAnalyticsEvent(upgradedEnv);

      sub = await ReadSubscription.findOne({ subscriptionId });
      expect(sub.planId).toBe('plan2');
      expect(sub.seatCount).toBe(10);
      expect(sub.aggregateVersion).toBe(2);
    });
  });

  describe('Invoice Projection', () => {
    it('creates and pays invoice', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const invoiceId = new mongoose.Types.ObjectId().toString();

      const createdEnv = generateEnvelope('invoice.created', {
        invoiceId,
        subscriptionId: 'sub1',
        invoiceNumber: 'INV-001',
        amount: 5000,
        currency: 'INR',
        dueDate: new Date(),
        status: 'open',
        aggregateVersion: 1,
      }, tenantId);

      await handleAnalyticsEvent(createdEnv);

      let inv = await ReadInvoice.findOne({ invoiceId });
      expect(inv.status).toBe('open');
      expect(inv.amountDue).toBe(5000);

      const paidEnv = generateEnvelope('invoice.paid', {
        invoiceId,
        amountPaid: 5000,
        paidAt: new Date(),
        paymentId: 'pay1',
        aggregateVersion: 2,
      }, tenantId);

      await handleAnalyticsEvent(paidEnv);

      inv = await ReadInvoice.findOne({ invoiceId });
      expect(inv.status).toBe('paid');
      expect(inv.amountPaid).toBe(5000);
      expect(inv.aggregateVersion).toBe(2);
    });
  });

  describe('Engagement Projection', () => {
    it('increments logins and failed payments', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      
      // Seed metrics
      await TenantEngagementMetrics.create({ tenantId });

      const loginEnv = generateEnvelope('user.login', {}, tenantId);
      await handleAnalyticsEvent(loginEnv);
      await handleAnalyticsEvent({ ...loginEnv, eventId: new mongoose.Types.ObjectId().toString() }); // another distinct event

      const failEnv = generateEnvelope('payment.failed', { orderId: 'ord1' }, tenantId);
      await handleAnalyticsEvent(failEnv);

      const metrics = await TenantEngagementMetrics.findOne({ tenantId });
      expect(metrics.totalLogins).toBe(2);
      expect(metrics.failedPaymentsCount).toBe(1);
    });
  });

  describe('Idempotency and Transaction Rollback', () => {
    it('ignores duplicate events', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const envelope = generateEnvelope('tenant.created', { name: 'T1', slug: 't1', email: 'o@t.com', createdAt: new Date(), aggregateVersion: 1 }, tenantId);

      await handleAnalyticsEvent(envelope);
      
      // Attempt to process same exact eventId again
      await handleAnalyticsEvent(envelope);

      const tenants = await ReadTenant.find({ tenantId });
      expect(tenants.length).toBe(1);

      const metrics = await TenantEngagementMetrics.find({ tenantId });
      expect(metrics.length).toBe(1);
    });

    it('rolls back on error and does not mark as processed', async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const envelope = generateEnvelope('tenant.created', { name: 'T1', slug: 't1', email: 'o@t.com', createdAt: new Date(), aggregateVersion: 1 }, tenantId);

      // Force an error by mocking ReadTenant.create
      const originalCreate = ReadTenant.create;
      ReadTenant.create = jest.fn().mockRejectedValue(new Error('Simulated failure'));

      await expect(handleAnalyticsEvent(envelope)).rejects.toThrow('Simulated failure');

      // Verify no changes were committed
      const tenants = await ReadTenant.find({ tenantId });
      expect(tenants.length).toBe(0);

      const metrics = await TenantEngagementMetrics.find({ tenantId });
      expect(metrics.length).toBe(0);

      const processed = await AnalyticsProcessedEvent.find({ eventId: envelope.eventId });
      expect(processed.length).toBe(0); // Can safely be retried

      // Restore
      ReadTenant.create = originalCreate;

      // Retry should succeed
      await handleAnalyticsEvent(envelope);
      const retriedTenants = await ReadTenant.find({ tenantId });
      expect(retriedTenants.length).toBe(1);
    });
  });
});
