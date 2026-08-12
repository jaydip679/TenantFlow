'use strict';

const { pdfWorker, processPdfJob } = require('./pdf.worker');
const { generateInvoicePdf } = require('./invoice.pdf.template');
const { cloudinaryUpload } = require('../config/cloudinary');
const redisClient = require('../config/redis');

jest.mock('./invoice.pdf.template', () => ({
  generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('test-pdf')),
}));

jest.mock('../config/cloudinary', () => ({
  cloudinaryUpload: jest.fn().mockResolvedValue({ secure_url: 'https://cloudinary.com/test.pdf' }),
}));

jest.mock('../config/redis', () => ({
  xadd: jest.fn().mockResolvedValue('123-0'),
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    add: jest.fn(),
  })),
}));

describe('PDF Worker', () => {
  it('processes a PDF job, uploads to Cloudinary, and emits pdf.generated', async () => {
    const job = {
      id: 'job-1',
      data: {
        invoiceId: 'inv-123',
        invoiceData: {
          invoice: { _id: 'inv-123', tenantId: 'tenant-1' },
          tenant: { name: 'Tenant 1' },
          subscription: { plan: 'pro' }
        }
      }
    };

    const result = await processPdfJob(job);

    expect(result.invoiceId).toBe('inv-123');
    expect(result.pdfUrl).toBe('https://cloudinary.com/test.pdf');
    expect(generateInvoicePdf).toHaveBeenCalledWith(
      job.data.invoiceData.invoice,
      job.data.invoiceData.tenant,
      job.data.invoiceData.subscription
    );
    expect(cloudinaryUpload).toHaveBeenCalled();
    expect(redisClient.xadd).toHaveBeenCalled();

    const xaddCalls = redisClient.xadd.mock.calls[0];
    expect(xaddCalls[0]).toBe('tenantflow:events');
    expect(xaddCalls[5]).toBe('pdf.generated');
  });
});
