'use strict';
/**
 * Local S-Implify API server.
 * Implements the exact HTTP contract consumed by the Angular frontend:
 *   baseURL: http://localhost:8080/api
 *   envelope: { statusCode, message, data }
 */
const express = require('express');
const cors = require('cors');
const { DB_PATH } = require('./db');
const { seedIfEmpty } = require('./seed');
const { verifyToken } = require('./util');

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// optional bearer-token introspection (never blocks, but protects switch-role ownership checks)
app.use((req, _res, next) => {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    const payload = verifyToken(header.slice(7).trim());
    if (payload) req.user = payload;
  }
  next();
});

// simple request log
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (process.env.LOG_REQUESTS === '1' || req.method !== 'GET') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// error responses must always follow the envelope shape
app.use((err, req, res, next) => {
  if (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ statusCode: 500, message: 'Internal server error', data: null });
  }
  next();
});

const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const uploadsRoutes = require('./routes/uploads');
const userRoutes = require('./routes/users');
const referenceRoutes = require('./routes/reference');
const aiRoutes = require('./routes/ai');
const districtLogoRoutes = require('./routes/district-logo');
const ttessRubricRoutes = require('./routes/ttess-rubric');

// analytics first: it owns /teachers/by-campus, /teachers/top etc.
app.use('/api/auth', authRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', uploadsRoutes);
// AI bridge must mount BEFORE referenceRoutes — that router ends with a terminal
// 404 catch-all that would otherwise swallow /api/ai/*.
app.use('/api', aiRoutes);
app.use('/api/users', userRoutes);
// T-TESS rubric (domains / questions / rating options) must also mount BEFORE
// referenceRoutes for the same catch-all reason.
app.use('/api', ttessRubricRoutes);
// district logo upload + static serving must also mount BEFORE referenceRoutes
app.use('/api', districtLogoRoutes);
app.use('/api/logos', express.static(require('./routes/district-logo').LOGOS_DIR));
app.use('/api', referenceRoutes);

// health + root
app.get('/health', (_req, res) => res.json({ statusCode: 200, message: 'OK', data: { service: 's-implify-backend', time: new Date().toISOString() } }));
app.get('/api', (_req, res) => res.json({ statusCode: 200, message: 'OK', data: { service: 's-implify-backend', api: true } }));
app.get('/', (_req, res) => res.redirect('/health'));

app.use((req, res) => {
  res.status(404).json({ statusCode: 404, message: `Endpoint not found: ${req.method} ${req.originalUrl}`, data: null });
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================================');
  console.log('  S-Implify local backend');
  console.log(`  API base : http://localhost:${PORT}/api`);
  console.log(`  Database : ${DB_PATH}`);
  console.log('  Demo users:');
  console.log('    admin@s-implify.local  / Admin@123   (SuperAdmin)');
  console.log('    demo@s-implify.local   / Demo@123    (SuperAdmin + DistrictAdmin + Principal)');
  console.log('    principal@s-implify.local / Principal@123');
  console.log('    teacher@s-implify.local   / Teacher@123');
  console.log('==========================================================');
});
