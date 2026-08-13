'use strict';

/**
 * Cloudinary SDK Configuration
 *
 * Provides a helper function for uploading buffers (from Multer memory storage)
 * to Cloudinary via the upload_stream API.
 *
 * Never write files to disk — Multer is configured for memory storage only.
 *
 * REF: docs/SYSTEM_DESIGN.md §10 — Cloudinary Integration
 */

const { v2: cloudinary } = require('cloudinary');
const { Readable }        = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Convert a Buffer to a Readable stream (required by Cloudinary upload_stream).
 * @param {Buffer} buffer
 * @returns {Readable}
 */
const bufferToStream = (buffer) => {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
};

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param {Buffer} buffer - File buffer from Multer memory storage
 * @param {Object} options - Cloudinary upload options (folder, transformation, etc.)
 * @returns {Promise<Object>} Cloudinary upload result with { public_id, secure_url, ... }
 */
const cloudinaryUpload = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    bufferToStream(buffer).pipe(uploadStream);
  });

/**
 * Delete a Cloudinary asset by its public_id.
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>}
 */
const cloudinaryDelete = (publicId) => cloudinary.uploader.destroy(publicId);

module.exports = { cloudinary, cloudinaryUpload, cloudinaryDelete };
