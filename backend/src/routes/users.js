'use strict';
/**
 * /api/users — matches UsersService contract (UserItemDto / UserRequest).
 */
const express = require('express');
const { getOne, getAll, insert, run, nowIso } = require('../db');
const { hashPassword, asBool, asBoolOrNull, asNumberOrNull } = require('../util');

const router = express.Router();

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

const ROLE_NAMES = { 1: 'SuperAdmin', 2: 'DistrictAdmin', 3: 'Principal', 4: 'Teacher' };

function assignmentToDto(a) {
  return {
    userRoleAssignmentId: a.userRoleAssignmentId,
    roleId: a.roleId,
    roleName: a.roleName || ROLE_NAMES[a.roleId] || null,
    stateId: a.stateId ?? null,
    districtId: a.districtId ?? null,
    campusId: a.campusId ?? null,
    teacherId: a.teacherId ?? null,
    ttessAccess: a.ttessAccess === null || a.ttessAccess === undefined ? null : !!a.ttessAccess,
    roleDescription: a.roleDescription ?? null,
    isActive: a.isActive === null ? null : !!a.isActive,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}

function userToDto(user) {
  if (!user) return null;
  const assignments = getAll(
    'SELECT * FROM user_role_assignments WHERE userId = ? ORDER BY userRoleAssignmentId',
    [user.userId],
  ).map(assignmentToDto);
  return {
    userId: user.userId,
    email: user.email,
    displayName: (user.displayName || '').trim() || user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    isActive: !!user.isActive,
    roleAssignments: assignments,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
    createdBy: user.createdBy ?? null,
    updatedBy: user.updatedBy ?? null,
  };
}

router.get('/', (req, res) => {
  const conds = [];
  const params = [];
  if (req.query.districtId !== undefined && String(req.query.districtId).trim() !== '') {
    // users scoped to a district = have any active assignment with that districtId
    conds.push('u.userId IN (SELECT userId FROM user_role_assignments WHERE districtId = ? AND (isActive IS NULL OR isActive = 1))');
    params.push(Number(req.query.districtId));
  }
  if (req.query.activeOnly !== undefined && String(req.query.activeOnly).trim().toLowerCase() === 'true') {
    conds.push('u.isActive = 1');
  }
  if (req.query.roleId !== undefined && String(req.query.roleId).trim() !== '') {
    conds.push('u.userId IN (SELECT userId FROM user_role_assignments WHERE roleId = ?)');
    params.push(Number(req.query.roleId));
  }
  // userRoleAssignmentId identifies the requester's own active assignment; the roleId
  // filter already scopes the list. Exact-matching on it would always return only the
  // requester, so it is intentionally not used as a filter condition.
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = getAll(`SELECT u.* FROM users u ${whereSql} ORDER BY u.userId`, params);
  return envelope(res, 'Success', rows.map(userToDto));
});

router.get('/:id', (req, res) => {
  const user = getOne('SELECT * FROM users WHERE userId = ?', [Number(req.params.id)]);
  if (!user) return envelope(res, 'User not found', null, 404);
  return envelope(res, 'Success', userToDto(user));
});

function resolveUserRequest(body) {
  const out = {
    email: (body.email || '').trim(),
    displayName: (body.displayName || '').trim(),
    firstName: body.firstName || null,
    lastName: body.lastName || null,
    isActive: body.isActive === undefined ? true : asBool(body.isActive, true),
  };
  if (body.password !== undefined && body.password !== null && String(body.password) !== '') {
    out.password = String(body.password);
  }
  if (body.createdBy) out.createdBy = body.createdBy;
  if (body.updatedBy) out.updatedBy = body.updatedBy;
  const assignments = Array.isArray(body.roleAssignments) ? body.roleAssignments : [];
  out.roleAssignments = assignments.map((a) => {
    const roleId = asNumberOrNull(a.roleId);
    const roleName = (a.roleName || ROLE_NAMES[roleId] || 'Teacher').toString();
    return {
      userRoleAssignmentId: a.userRoleAssignmentId ? asNumberOrNull(a.userRoleAssignmentId) : null,
      roleId: roleId || 0,
      roleName,
      stateId: asNumberOrNull(a.stateId),
      districtId: asNumberOrNull(a.districtId),
      campusId: asNumberOrNull(a.campusId),
      teacherId: asNumberOrNull(a.teacherId),
      ttessAccess: asBoolOrNull(a.ttessAccess),
      roleDescription: a.roleDescription || null,
      isActive: a.isActive === undefined ? true : asBool(a.isActive, true),
    };
  }).filter((a) => a.roleId > 0);
  return out;
}

router.post('/', (req, res) => {
  const body = resolveUserRequest(req.body || {});
  if (!body.email) return envelope(res, 'Email is required', null, 400);
  if (body.roleAssignments.length === 0) return envelope(res, 'At least one role assignment is required', null, 400);

  const existing = getOne('SELECT userId FROM users WHERE LOWER(email) = LOWER(?)', [body.email]);
  if (existing) return envelope(res, 'A user with this email already exists', null, 409);

  const password = body.password || 'Temp@123';
  const { hash, salt } = hashPassword(password);
  const userId = insert(
    'INSERT INTO users (email, passwordHash, passwordSalt, firstName, lastName, displayName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?,?,?)',
    [body.email, hash, salt, body.firstName, body.lastName, body.displayName || body.email, body.isActive ? 1 : 0, nowIso(), body.createdBy || body.updatedBy || 'local-api'],
  );
  for (const a of body.roleAssignments) {
    insert(
      `INSERT INTO user_role_assignments (userId, roleId, roleName, stateId, districtId, campusId, teacherId, ttessAccess, roleDescription, isActive, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, a.roleId, a.roleName, a.stateId, a.districtId, a.campusId, a.teacherId, a.ttessAccess === null ? null : (a.ttessAccess ? 1 : 0),
        a.roleDescription, a.isActive ? 1 : 0, nowIso()],
    );
  }
  const user = getOne('SELECT * FROM users WHERE userId = ?', [userId]);
  return envelope(res, 'User created', userToDto(user));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = getOne('SELECT * FROM users WHERE userId = ?', [id]);
  if (!user) return envelope(res, 'User not found', null, 404);
  const body = resolveUserRequest(req.body || {});

  run('UPDATE users SET firstName = ?, lastName = ?, displayName = ?, isActive = ?, updatedAt = ?, updatedBy = ? WHERE userId = ?',
    [body.firstName, body.lastName, body.displayName || user.email, body.isActive ? 1 : 0, nowIso(), body.updatedBy || 'local-api', id]);
  if (body.password) {
    const { hash, salt } = hashPassword(body.password);
    run('UPDATE users SET passwordHash = ?, passwordSalt = ? WHERE userId = ?', [hash, salt, id]);
  }
  if (body.email && body.email.toLowerCase() !== String(user.email).toLowerCase()) {
    const clash = getOne('SELECT userId FROM users WHERE LOWER(email) = LOWER(?) AND userId <> ?', [body.email, id]);
    if (clash) return envelope(res, 'Another user already uses that email', null, 409);
    run('UPDATE users SET email = ? WHERE userId = ?', [body.email, id]);
  }

  if (body.roleAssignments.length > 0) {
    // Upsert assignments: keep ones still present (by id), deactivate removed ones.
    const existing = getAll('SELECT * FROM user_role_assignments WHERE userId = ?', [id]);
    const wantedIds = body.roleAssignments.map((a) => a.userRoleAssignmentId).filter((v) => v !== null);
    for (const e of existing) {
      if (!wantedIds.includes(e.userRoleAssignmentId)) {
        run('UPDATE user_role_assignments SET isActive = 0, updatedAt = ? WHERE userRoleAssignmentId = ?', [nowIso(), e.userRoleAssignmentId]);
      }
    }
    for (const a of body.roleAssignments) {
      if (a.userRoleAssignmentId) {
        run(
          `UPDATE user_role_assignments SET roleId = ?, roleName = ?, stateId = ?, districtId = ?, campusId = ?, teacherId = ?,
           ttessAccess = ?, roleDescription = ?, isActive = ?, updatedAt = ? WHERE userRoleAssignmentId = ?`,
          [a.roleId, a.roleName, a.stateId, a.districtId, a.campusId, a.teacherId,
            a.ttessAccess === null ? null : (a.ttessAccess ? 1 : 0), a.roleDescription, a.isActive ? 1 : 0, nowIso(), a.userRoleAssignmentId],
        );
      } else {
        insert(
          `INSERT INTO user_role_assignments (userId, roleId, roleName, stateId, districtId, campusId, teacherId, ttessAccess, roleDescription, isActive, createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, a.roleId, a.roleName, a.stateId, a.districtId, a.campusId, a.teacherId,
            a.ttessAccess === null ? null : (a.ttessAccess ? 1 : 0), a.roleDescription, a.isActive ? 1 : 0, nowIso()],
        );
      }
    }
  }
  const updated = getOne('SELECT * FROM users WHERE userId = ?', [id]);
  return envelope(res, 'User updated', userToDto(updated));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = getOne('SELECT * FROM users WHERE userId = ?', [id]);
  if (!user) return envelope(res, 'User not found', null, 404);
  run('DELETE FROM user_role_assignments WHERE userId = ?', [id]);
  run('DELETE FROM password_resets WHERE userId = ?', [id]);
  run('DELETE FROM users WHERE userId = ?', [id]);
  return envelope(res, 'User deleted', null);
});

router.use((req, res) => {
  envelope(res, `Users endpoint not found: ${req.method} ${req.originalUrl}`, null, 404);
});

module.exports = router;
