/**
 * File Storage Service
 * Abstraction layer for file storage - currently uses local filesystem,
 * designed to be easily swappable with S3.
 */
import { writeFile, readFile, unlink, mkdir, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const STORAGE_TYPE = process.env.FILE_STORAGE_TYPE || 'local'; // 'local' | 's3'
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ||
  join(__dirname, '../../../../uploads');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await access(LOCAL_UPLOAD_DIR);
  } catch {
    await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Generate a unique file path for storage
 * @param {string} tenantSchema - Tenant identifier
 * @param {string} uploadId - Exam upload UUID
 * @param {string} originalName - Original filename
 * @returns {string} Storage path/key
 */
export function generateFilePath(tenantSchema, uploadId, originalName) {
  const ext = originalName.split('.').pop() || 'pdf';
  const timestamp = Date.now();
  return `${tenantSchema}/${uploadId}/${timestamp}.${ext}`;
}

/**
 * Get full local path from storage key
 * @param {string} storagePath
 * @returns {string}
 */
function getFullPath(storagePath) {
  return join(LOCAL_UPLOAD_DIR, storagePath);
}

/**
 * Save a file to storage
 * @param {Buffer} fileBuffer - File contents
 * @param {string} storagePath - Path/key to store at
 * @returns {Promise<{size: number}>}
 */
export async function saveFile(fileBuffer, storagePath) {
  await ensureUploadDir();

  if (STORAGE_TYPE === 'local') {
    const fullPath = getFullPath(storagePath);

    // Ensure subdirectory exists
    const dir = dirname(fullPath);
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(fullPath, fileBuffer);

    logger.info('File saved locally', { path: storagePath, size: fileBuffer.length });

    return { size: fileBuffer.length };
  }

  // Future: S3 implementation
  // if (STORAGE_TYPE === 's3') {
  //   return saveToS3(fileBuffer, storagePath);
  // }

  throw new Error(`Unknown storage type: ${STORAGE_TYPE}`);
}

/**
 * Read a file from storage
 * @param {string} storagePath - Path/key to read from
 * @returns {Promise<Buffer>}
 */
export async function readFileFromStorage(storagePath) {
  if (STORAGE_TYPE === 'local') {
    const fullPath = getFullPath(storagePath);
    return readFile(fullPath);
  }

  // Future: S3 implementation
  // if (STORAGE_TYPE === 's3') {
  //   return readFromS3(storagePath);
  // }

  throw new Error(`Unknown storage type: ${STORAGE_TYPE}`);
}

/**
 * Delete a file from storage
 * @param {string} storagePath - Path/key to delete
 */
export async function deleteFile(storagePath) {
  if (!storagePath) return;

  try {
    if (STORAGE_TYPE === 'local') {
      const fullPath = getFullPath(storagePath);
      await unlink(fullPath);
      logger.info('File deleted locally', { path: storagePath });
    }

    // Future: S3 implementation
    // if (STORAGE_TYPE === 's3') {
    //   await deleteFromS3(storagePath);
    // }
  } catch (err) {
    // File may not exist, log but don't throw
    logger.warn('Failed to delete file', { path: storagePath, error: err.message });
  }
}

/**
 * Get the public URL for a file
 * @param {string} storagePath
 * @returns {string|null}
 */
export function getFileUrl(storagePath) {
  if (!storagePath) return null;

  if (STORAGE_TYPE === 'local') {
    // In production, this would be a CDN or S3 URL
    // For now, return a relative path that can be served
    return `/uploads/${storagePath}`;
  }

  // Future: S3 implementation
  // if (STORAGE_TYPE === 's3') {
  //   return getS3Url(storagePath);
  // }

  return null;
}

/**
 * Get storage stats/info
 * @returns {Object}
 */
export function getStorageInfo() {
  return {
    type: STORAGE_TYPE,
    localUploadDir: LOCAL_UPLOAD_DIR,
  };
}
