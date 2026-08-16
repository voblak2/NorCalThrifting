import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';

const router = express.Router();

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('images_only'));
    cb(null, true);
  },
});

// POST /api/uploads — authenticated users only; returns { urls: ['https://<public-r2-url>/<name>', ...] }
router.post('/uploads', requireAuth, upload.array('photos', 5), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'no_files' });

  try {
    const urls = [];
    for (const file of files) {
      const name = randomBytes(12).toString('hex') + '.jpg';
      // .rotate() applies EXIF orientation then strips all metadata; sharp never copies EXIF to output by default
      const buffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();

      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: name,
        Body: buffer,
        ContentType: 'image/jpeg',
      }));

      urls.push(`${process.env.R2_PUBLIC_URL}/${name}`);
    }
    res.json({ urls });
  } catch (err) {
    console.error('[uploads] error:', err);
    res.status(500).json({ error: 'upload_failed' });
  }
});

export default router;
