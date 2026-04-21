const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const LOCAL_UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR || path.join(__dirname, '..', '..', 'uploads');
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';

let r2Client = null;

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const sanitizeSegment = (input) => {
  return String(input || 'unknown')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'unknown';
};

const buildObjectKey = (folder, originalName) => {
  const ext = path.extname(originalName || '').toLowerCase();
  const base = path.basename(originalName || 'file', ext).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'file';
  return `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`;
};

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value || '');

const getR2Client = () => {
  if (r2Client) {
    return r2Client;
  }

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
    throw new Error('R2 config missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.');
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });

  return r2Client;
};

const uploadWithLocalFs = async (file, folder) => {
  const safeFolder = folder.split('/').map((part) => sanitizeSegment(part)).join('/');
  const key = buildObjectKey(safeFolder, file.originalname);
  const destPath = path.join(LOCAL_UPLOAD_BASE_DIR, key);
  ensureDirExists(path.dirname(destPath));
  await fs.promises.writeFile(destPath, file.buffer);
  return key;
};

const uploadWithR2 = async (file, folder) => {
  const safeFolder = folder.split('/').map((part) => sanitizeSegment(part)).join('/');
  const key = buildObjectKey(safeFolder, file.originalname);
  const client = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));

  if (!R2_PUBLIC_BASE_URL) {
    return key;
  }

  return `${R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;
};

const uploadFile = async (file, folder) => {
  const provider = (process.env.STORAGE_PROVIDER || '').toLowerCase();
  if (provider === 'r2') {
    return uploadWithR2(file, folder);
  }
  return uploadWithLocalFs(file, folder);
};

const toPublicAssetUrl = (storedValue) => {
  if (!storedValue) {
    return null;
  }
  if (isAbsoluteUrl(storedValue)) {
    return storedValue;
  }
  if (R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${storedValue.replace(/^\/+/, '')}`;
  }
  return `/uploads/${storedValue.replace(/^\/+/, '')}`;
};

module.exports = {
  sanitizeSegment,
  uploadFile,
  toPublicAssetUrl
};
