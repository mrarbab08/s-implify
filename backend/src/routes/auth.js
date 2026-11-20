'use strict';
/**
 * /api/auth — matches the frontend AuthService contract exactly.
 * Envelope: { statusCode, message, data: AuthResponseDto }
 */
const express = require('express');
const { getOne, getAll, insert, run, nowIso } = require('../db');
const { signToken, verifyToken, hashPassword, verifyPassword } = require('../util');

const router = express.Router();

const ROLE_IDS = { SuperAdmin: 1, DistrictAdmin: 2, Principal: 3, Teacher: 4 };

function buildAuthResponse(userId, activeAssignmentId = null) {
  const user = getOne('SELECT * FROM users WHERE userId = ?', [userId]);
  if (!user) return null;
  const assignments = getAll(
    'SELECT * FROM user_role_assignments WHERE userId = ? AND isActive = 1 ORDER BY userRoleAssignmentId',
    [userId],
  ).map((a) => ({
    userRoleAssignmentId: a.userRoleAssignmentId,
    roleId: a.roleId,
    roleName: a.roleName,
    stateId: a.stateId ?? null,
    districtId: a.districtId ?? null,
    campusId: a.campusId ?? null,
    teacherId: a.teacherId ?? null,
    roleDescription: a.roleDescription ?? null,
    ttessAccess: a.ttessAccess === null || a.ttessAccess === undefined ? true : !!a.ttessAccess,
  }));

  let activeRole = null;
  if (activeAssignmentId !== null && activeAssignmentId !== undefined) {
    activeRole = assignments.find((r) => r.userRoleAssignmentId === Number(activeAssignmentId)) || null;
  }
  if (!activeRole) activeRole = assignments[0] || null;

  const token = signToken({
    sub: String(user.userId),
    email: user.email,
    role: activeRole ? activeRole.roleName : 'Teacher',
  });

  const data = {
    userId: user.userId,
    email: user.email,
    displayName: (user.displayName || '').trim() || user.email,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    token,
    activeRole,
    roles: assignments,
  };
  return data;
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ statusCode: 400, message: 'Email and password are required', data: null });
  }
  const user = getOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [String(email).trim()]);
  if (!user || !user.isActive) {
    return res.status(401).json({ statusCode: 401, message: 'Invalid email or password', data: null });
  }
  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return res.status(401).json({ statusCode: 401, message: 'Invalid email or password', data: null });
  }
  const data = buildAuthResponse(user.userId, null);
  return res.json({ statusCode: 200, message: 'Login successful', data });
});

router.post('/switch-role', (req, res) => {
  const { userRoleAssignmentId } = req.body || {};
  const tokenUserId = req.user ? Number(req.user.sub) : null;

  const target = userRoleAssignmentId
    ? getOne('SELECT * FROM user_role_assignments WHERE userRoleAssignmentId = ?', [Number(userRoleAssignmentId)])
    : null;
  if (!target) {
    return res.status(404).json({ statusCode: 404, message: 'Role assignment not found', data: null });
  }
  if (tokenUserId && Number(target.userId) !== tokenUserId) {
    return res.status(403).json({ statusCode: 403, message: 'Role assignment does not belong to current user', data: null });
  }
  run('UPDATE user_role_assignments SET updatedAt = ? WHERE userRoleAssignmentId = ?', [nowIso(), target.userRoleAssignmentId]);
  const data = buildAuthResponse(target.userId, target.userRoleAssignmentId);
  return res.json({ statusCode: 200, message: 'Role switched successfully', data });
});

/**
 * Registers a super-admin. Open bootstrap endpoint (mirrors the real API);
 * always auto-logs in the created user.
 */
router.post('/register/super-admin', (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ statusCode: 400, message: 'Email and password are required', data: null });
  }
  const existing = getOne('SELECT userId FROM users WHERE LOWER(email) = LOWER(?)', [String(email).trim()]);
  if (existing) {
    return res.status(409).json({ statusCode: 409, message: 'A user with this email already exists', data: null });
  }
  const { hash, salt } = hashPassword(password);
  const userId = insert(
    'INSERT INTO users (email, passwordHash, passwordSalt, firstName, lastName, displayName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?,?,?)',
    [String(email).trim(), hash, salt, null, null, (displayName || '').trim() || String(email).trim(), 1, nowIso(), String(email).trim()],
  );
  insert(
    `INSERT INTO user_role_assignments (userId, roleId, roleName, ttessAccess, roleDescription, isActive, createdAt)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, ROLE_IDS.SuperAdmin, 'SuperAdmin', 1, 'Full platform access across all districts and campuses.', 1, nowIso()],
  );
  const data = buildAuthResponse(userId, null);
  return res.json({ statusCode: 200, message: 'Super admin registered successfully', data });
});

/** Forgot password — issues a local reset token (returned in data for local testing since no SMTP is configured). */
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ statusCode: 400, message: 'Email is required', data: null });
  }
  const user = getOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [String(email).trim()]);
  let resetToken = null;
  if (user) {
    resetToken = require('crypto').randomBytes(24).toString('hex');
    run('DELETE FROM password_resets WHERE userId = ?', [user.userId]);
    run('INSERT INTO password_resets (token, userId, createdAt) VALUES (?,?,?)', [resetToken, user.userId, nowIso()]);
  }
  // Same response whether or not the account exists (no account enumeration)
  return res.json({
    statusCode: 200,
    message: 'If an account exists for that email, a reset link has been sent.',
    data: resetToken ? { resetToken } : null,
  });
});

router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ statusCode: 400, message: 'Token and new password are required', data: null });
  }
  const row = getOne('SELECT * FROM password_resets WHERE token = ?', [String(token).trim()]);
  if (!row || row.usedAt) {
    return res.status(400).json({ statusCode: 400, message: 'Invalid or expired reset token', data: null });
  }
  const { hash, salt } = hashPassword(newPassword);
  run('UPDATE users SET passwordHash = ?, passwordSalt = ?, updatedAt = ? WHERE userId = ?', [hash, salt, nowIso(), row.userId]);
  run('UPDATE password_resets SET usedAt = ? WHERE token = ?', [nowIso(), row.token]);
  return res.json({ statusCode: 200, message: 'Password reset successful', data: null });
});

/** Convenience route for the frontend-token introspection (kept for completeness). */
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ statusCode: 401, message: 'Not authenticated', data: null });
  const data = buildAuthResponse(Number(req.user.sub), null);
  if (!data) return res.status(404).json({ statusCode: 404, message: 'User not found', data: null });
  return res.json({ statusCode: 200, message: 'Success', data });
});

router.use((req, res) => {
  res.status(404).json({ statusCode: 404, message: `Auth endpoint not found: ${req.method} ${req.originalUrl}`, data: null });
});

module.exports = router;
