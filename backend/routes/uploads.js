import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';
import { unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
const TMP_DIR    = join(UPLOADS_DIR, 'tmp');

await mkdir(UPLOADS_DIR, { recursive: true });
await mkdir(TMP_DIR,    { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('images_only'));
    cb(null, true);
  },
});

// POST /api/uploads — authenticated users only; returns { urls: ['/uploads/<name>', ...] }
router.post('/uploads', requireAuth, upload.array('photos', 5), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'no_files' });

  try {
    const urls = [];
    for (const file of files) {
      const name = randomBytes(12).toString('hex') + '.jpg';
      const dest = join(UPLOADS_DIR, name);
      // .rotate() applies EXIF orientation then strips all metadata; sharp never copies EXIF to output by default
      await sharp(file.path)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(dest);
      await unlink(file.path);
      urls.push(`/uploads/${name}`);
    }
    res.json({ urls });
  } catch (err) {
    console.error('[uploads] error:', err);
    for (const file of files) unlink(file.path).catch(() => {});
    res.status(500).json({ error: 'upload_failed' });
  }
});

export default router;
