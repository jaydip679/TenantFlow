'use strict';

/**
 * Upload Middleware — Multer Configuration
 *
 * Provides multer instances for image and PDF file uploads.
 * Uses MEMORY storage — files are NEVER written to disk.
 * Buffers are passed directly to Cloudinary via upload_stream.
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.8
 * REF: docs/SYSTEM_DESIGN.md §10 — Cloudinary Integration
 */

const multer = require('multer');
const { AppError }    = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

// Memory storage — buffer is available at req.file.buffer
const memoryStorage = multer.memoryStorage();

/**
 * File filter for image uploads (JPEG, PNG, WebP only).
 */
const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
        422,
        ERROR_CODES.VALIDATION_ERROR,
        { allowedTypes: allowedMimeTypes, received: file.mimetype }
      ),
      false
    );
  }
};

/**
 * File filter for PDF uploads.
 */
const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only PDF files are allowed.',
        422,
        ERROR_CODES.VALIDATION_ERROR,
        { allowedTypes: ['application/pdf'], received: file.mimetype }
      ),
      false
    );
  }
};

/**
 * Image upload multer instance.
 * Max size: 5MB | Types: JPEG, PNG, WebP
 * Used for: user avatars, tenant logos
 */
const imageUpload = multer({
  storage:  memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files:    1,
  },
});

/**
 * PDF upload multer instance.
 * Max size: 20MB | Types: application/pdf
 * (Not used in v1 — PDFs are generated server-side via PDFKit)
 */
const pdfUpload = multer({
  storage:  memoryStorage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files:    1,
  },
});

module.exports = { imageUpload, pdfUpload };
