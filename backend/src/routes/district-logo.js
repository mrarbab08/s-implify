'use strict';
/**
 * District logo upload: POST /api/districts/:id/logo (multipart field `logo`).
 * Stores the image in data/uploads/logos, records the public URL in
 * districts.districtLogo (a field the generic reference router already accepts),
 * and serves the directory at GET /api/logos/<file> via express.static (server.js).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getOne, run, nowIso, DATA_DIR } = require('../db');

const router = express.Router();

const LOGOS_DIR = path.join(DATA_DIR, 'uploads', 'logos');
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-district${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED.has(ext) || !/^image\//.test(file.mimetype || '')) {
      return cb(new Error('Only image files (png, jpg, gif, webp, svg) up to 5 MB are allowed'));
    }
    cb(null, true);
  },
});

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

function publicUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/api/logos/${filename}`;
}

function deleteOldLogo(oldUrl) {
  const marker = '/api/logos/';
  const i = (oldUrl || '').indexOf(marker);
  if (i < 0) return;
  const oldFile = path.join(LOGOS_DIR, path.basename(oldUrl.slice(i + marker.length)));
  if (fs.existsSync(oldFile)) {
    try { fs.unlinkSync(oldFile); } catch { /* keep going */ }
  }
}

router.post('/districts/:id/logo', upload.single('logo'), (req, res) => {
  const id = Number(req.params.id);
  const district = getOne('SELECT * FROM districts WHERE districtId = ?', [id]);
  if (!district) return envelope(res, 'District not found', null, 404);
  if (!req.file) return envelope(res, 'No logo file received (multipart field must be "logo")', null, 400);
  deleteOldLogo(district.districtLogo);
  const url = publicUrl(req, req.file.filename);
  run('UPDATE districts SET districtLogo = ?, updatedAt = ?, updatedBy = ? WHERE districtId = ?', [
    url, nowIso(), 'district-logo-upload', id,
  ]);
  const updated = getOne('SELECT * FROM districts WHERE districtId = ?', [id]);
  return envelope(res, 'Logo uploaded', { districtLogo: url, district: updated });
});

router.delete('/districts/:id/logo', (req, res) => {
  const id = Number(req.params.id);
  const district = getOne('SELECT * FROM districts WHERE districtId = ?', [id]);
  if (!district) return envelope(res, 'District not found', null, 404);
  deleteOldLogo(district.districtLogo);
  run('UPDATE districts SET districtLogo = NULL, updatedAt = ?, updatedBy = ? WHERE districtId = ?', [
    nowIso(), 'district-logo-upload', id,
  ]);
  return envelope(res, 'Logo removed', { districtLogo: null });
});

// multer / fileFilter errors -> clean 400 instead of the global 500
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err) return envelope(res, err.message || 'Logo upload failed', null, 400);
  return next();
});

module.exports = router;
module.exports.LOGOS_DIR = LOGOS_DIR;
