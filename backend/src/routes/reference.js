'use strict';
/**
 * Reference/setup CRUD endpoints (AdminSetupsService + FiltersService + RolesService contracts).
 * Every entity: GET list, GET by id, POST, PUT by id — all wrapped in ApiResponse.
 */
const express = require('express');
const { getOne, getAll, insert, run, nowIso } = require('../db');
const { asBool } = require('../util');

const router = express.Router();

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

function rowsToJs(rows) {
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === 'isActive' || k === 'sortOrder' || k === 'ttessAccess' || k === 'isCurrentWindow') {
        if (k === 'isActive' || k === 'ttessAccess' || k === 'isCurrentWindow') out[k] = v === null ? null : !!v;
        else out[k] = v;
      } else {
        out[k] = v ?? null;
      }
    }
    return out;
  });
}

function activeOnlyFlag(req) {
  // Contract: activeOnly=true -> only active rows; false or absent -> ALL rows (incl. inactive)
  if (req.query.activeOnly === undefined) return null;
  return asBool(req.query.activeOnly, false) ? true : null;
}

const filterable = (req, keys) => {
  const out = [];
  const params = [];
  for (const k of keys) {
    const v = req.query[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      out.push(`${k} = ?`);
      params.push(Number(v));
    }
  }
  return { where: out, params };
};

// --------------------------------------------------------------- entity registry
const ENTITIES = {
  states: {
    table: 'states', id: 'stateId',
    fields: ['stateCode', 'stateName'],
    list: (req) => { const a = activeOnlyFlag(req); const rows = a === null ? getAll('SELECT * FROM states ORDER BY stateId') : getAll('SELECT * FROM states WHERE isActive = ? ORDER BY stateId', [a ? 1 : 0]); return rows; },
  },
  districts: {
    table: 'districts', id: 'districtId',
    fields: ['stateId', 'districtName', 'districtCode', 'districtAbbreviation', 'districtPhone', 'districtLogo', 'districtTimeZone'],
    listQuery: 'SELECT * FROM districts {WHERE} ORDER BY districtId',
    filters: ['stateId', 'isActive'],
    list: (req) => {
      const conds = [];
      const params = [];
      const { where, params: p } = filterable(req, ['stateId']);
      conds.push(...where); params.push(...p);
      if (req.query.activeOnly !== undefined && activeOnlyFlag(req) === true) {
        conds.push('isActive = ?'); params.push(1);
      }
      const sql = conds.length
        ? `SELECT * FROM districts WHERE ${conds.join(' AND ')} ORDER BY districtId`
        : 'SELECT * FROM districts ORDER BY districtId';
      return getAll(sql, params);
    },
    extraFields: ['districtCode'],
  },
  'district-quarters': {
    table: 'district_quarters', id: 'districtQuarterId',
    fields: ['districtId', 'academicYearId', 'quarterCode', 'quarterName', 'startDate', 'endDate', 'sortOrder', 'isCurrentWindow'],
    /**
     * Only ONE period per district + academic year may be flagged as the current
     * assessment window — clearing siblings is enforced here after every save.
     */
    afterSave: (row, body) => {
      if (body && Number(body.isCurrentWindow) === 1 && row) {
        run(
          'UPDATE district_quarters SET isCurrentWindow = 0 WHERE districtId = ? AND academicYearId = ? AND districtQuarterId <> ?',
          [row.districtId, row.academicYearId, row.districtQuarterId],
        );
      }
    },
    list: (req) => {
      const conds = [];
      const params = [];
      const { where, params: p } = filterable(req, ['districtId', 'academicYearId']);
      conds.push(...where); params.push(...p);
      const ao = activeOnlyFlag(req);
      if (ao === true) { conds.push('isActive = ?'); params.push(1); }
      const sql = conds.length
        ? `SELECT * FROM district_quarters WHERE ${conds.join(' AND ')} ORDER BY districtId, sortOrder`
        : 'SELECT * FROM district_quarters ORDER BY districtId, sortOrder';
      return getAll(sql, params);
    },
  },
  'district-academies': {
    table: 'district_academies', id: 'districtAcademyId',
    fields: ['districtId', 'academyCode', 'academyName', 'sortOrder'],
    list: (req) => {
      const conds = [];
      const params = [];
      const { where, params: p } = filterable(req, ['districtId']);
      conds.push(...where); params.push(...p);
      const ao = activeOnlyFlag(req);
      if (ao === true) { conds.push('isActive = ?'); params.push(1); }
      const sql = conds.length
        ? `SELECT * FROM district_academies WHERE ${conds.join(' AND ')} ORDER BY sortOrder, districtAcademyId`
        : 'SELECT * FROM district_academies ORDER BY sortOrder, districtAcademyId';
      return getAll(sql, params);
    },
  },
  grades: {
    table: 'grades', id: 'gradeId',
    fields: ['gradeCode', 'gradeName', 'sortOrder'],
    list: (req) => {
      const ao = activeOnlyFlag(req);
      const sql = 'SELECT * FROM grades ORDER BY sortOrder, gradeId';
      return ao === true
        ? getAll('SELECT * FROM grades WHERE isActive = ? ORDER BY sortOrder, gradeId', [1])
        : getAll(sql);
    },
  },
  'campus-categories': {
    table: 'campus_categories', id: 'campusCategoryId',
    fields: ['categoryName', 'categoryCode'],
    list: (req) => {
      const ao = activeOnlyFlag(req);
      const sql = 'SELECT * FROM campus_categories ORDER BY campusCategoryId';
      return ao === true
        ? getAll('SELECT * FROM campus_categories WHERE isActive = ? ORDER BY campusCategoryId', [1])
        : getAll(sql);
    },
  },
  campuses: {
    table: 'campuses', id: 'campusId',
    fields: ['districtId', 'campusCategoryId', 'campusCode', 'campusIdExternal', 'campusName', 'campusAddress', 'campusPhone', 'principalName'],
    list: (req) => {
      const conds = [];
      const params = [];
      const { where, params: p } = filterable(req, ['districtId']);
      conds.push(...where); params.push(...p);
      const ao = activeOnlyFlag(req);
      if (ao === true) { conds.push('isActive = ?'); params.push(1); }
      const sql = conds.length
        ? `SELECT * FROM campuses WHERE ${conds.join(' AND ')} ORDER BY campusId`
        : 'SELECT * FROM campuses ORDER BY campusId';
      return getAll(sql, params);
    },
  },
  'academic-years': {
    table: 'academic_years', id: 'academicYearId',
    fields: ['yearLabel', 'startDate', 'endDate'],
    list: (req) => {
      const ao = activeOnlyFlag(req);
      const sql = 'SELECT * FROM academic_years ORDER BY academicYearId';
      return ao === true
        ? getAll('SELECT * FROM academic_years WHERE isActive = ? ORDER BY academicYearId', [1])
        : getAll(sql);
    },
  },
  subjects: {
    table: 'subjects', id: 'subjectId',
    fields: ['subjectCode', 'subjectName'],
    list: (req) => {
      const ao = activeOnlyFlag(req);
      const sql = 'SELECT * FROM subjects ORDER BY subjectId';
      return ao === true
        ? getAll('SELECT * FROM subjects WHERE isActive = ? ORDER BY subjectId', [1])
        : getAll(sql);
    },
  },
  teachers: {
    table: 'teachers', id: 'teacherId',
    fields: ['teacherIdExternal', 'districtId', 'campusId', 'gradeId', 'subjectId', 'firstName', 'lastName'],
    list: (req) => {
      const conds = [];
      const params = [];
      const { where, params: p } = filterable(req, ['districtId', 'campusId']);
      conds.push(...where); params.push(...p);
      const campusCode = req.query.campusCode;
      if (campusCode) {
        const campus = getOne('SELECT campusId FROM campuses WHERE campusCode = ?', [String(campusCode).toUpperCase()]);
        conds.push('campusId = ?'); params.push(campus ? campus.campusId : -1);
      }
      const sql = conds.length
        ? `SELECT * FROM teachers WHERE ${conds.join(' AND ')} ORDER BY teacherId`
        : 'SELECT * FROM teachers ORDER BY teacherId';
      return getAll(sql, params);
    },
  },
};

for (const [name, spec] of Object.entries(ENTITIES)) {
  // GET list
  router.get(`/${name}`, (req, res) => envelope(res, 'Success', rowsToJs(spec.list(req))));
  // GET by id
  router.get(`/${name}/:id`, (req, res) => {
    const row = getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [Number(req.params.id)]);
    if (!row) return envelope(res, `${name} not found`, null, 404);
    return envelope(res, 'Success', rowsToJs([row])[0]);
  });
  // POST create
  router.post(`/${name}`, (req, res) => {
    const body = req.body || {};
    if (spec.fields.length && spec.fields.slice(0, 2).every((f) => body[f] === undefined) && !(name === 'teachers')) {
      // tolerate empty creates? no — validate minimally on key fields
    }
    const cols = [];
    const vals = [];
    for (const f of spec.fields) {
      if (body[f] !== undefined) { cols.push(f); vals.push(body[f]); }
    }
    if (body.isActive !== undefined) { cols.push('isActive'); vals.push(asBool(body.isActive, true) ? 1 : 0); }
    cols.push('createdAt', 'createdBy');
    vals.push(nowIso(), body.createdBy || req.user?.email || 'local-api');
    for (const c of cols) if (c === undefined) return envelope(res, 'Invalid body', null, 400);
    if (!cols.length) return envelope(res, 'Invalid body', null, 400);
    const placeholders = cols.map(() => '?').join(', ');
    let sql;
    try {
      sql = `INSERT INTO ${spec.table} (${cols.map((c) => `[${c}]`).join(', ')}) VALUES (${placeholders})`;
      const id = insert(sql, vals);
      // for campuses/teachers external key default handling
      if (spec.table === 'teachers' && !body.teacherIdExternal) {
        // nothing
      }
      const row = getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [id]);
      if (spec.afterSave) spec.afterSave(row, body);
      return envelope(res, `${singular(name)} saved`, rowsToJs([getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [id])]));
    } catch (e) {
      return envelope(res, e.message, null, 400);
    }
  });
  // PUT update
  router.put(`/${name}/:id`, (req, res) => {
    const body = req.body || {};
    const id = Number(req.params.id);
    const existing = getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [id]);
    if (!existing) return envelope(res, `${singular(name)} not found`, null, 404);
    const sets = [];
    const vals = [];
    for (const f of spec.fields) {
      if (body[f] !== undefined) { sets.push(`[${f}] = ?`); vals.push(body[f]); }
    }
    if (body.isActive !== undefined) { sets.push('[isActive] = ?'); vals.push(asBool(body.isActive, true) ? 1 : 0); }
    sets.push('[updatedAt] = ?', '[updatedBy] = ?');
    vals.push(nowIso(), body.updatedBy || req.user?.email || 'local-api', id);
    try {
      run(`UPDATE ${spec.table} SET ${sets.join(', ')} WHERE ${spec.id} = ?`, vals);
      const row = getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [id]);
      if (spec.afterSave) spec.afterSave(row, body);
      return envelope(res, `${singular(name)} updated`, rowsToJs([getOne(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`, [id])]));
    } catch (e) {
      return envelope(res, e.message, null, 400);
    }
  });
}

function singular(name) {
  const map = {
    states: 'State', districts: 'District', 'district-quarters': 'District quarter', 'district-academies': 'District academy',
    grades: 'Grade', 'campus-categories': 'Campus category', campuses: 'Campus', 'academic-years': 'Academic year',
    subjects: 'Subject', teachers: 'Teacher',
  };
  return map[name] || name;
}

// --------------------------------------------------------------- special routes (must be before :id handlers? express routes above already registered)
// DELETE subjects/{id}
router.delete('/subjects/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOne('SELECT * FROM subjects WHERE subjectId = ?', [id]);
  if (!existing) return envelope(res, 'Subject not found', null, 404);
  run('DELETE FROM district_subjects WHERE subjectId = ?', [id]);
  run('DELETE FROM subjects WHERE subjectId = ?', [id]);
  return envelope(res, 'Subject deleted', null);
});

// ---------------------------------------------------------------- DELETE districts / campuses (with dependency safety checks)

const tableColumns = (table) =>
  getAll(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name);

/**
 * Scan every table holding `column` and either collect blockers (rows still
 * referencing the record) or cascade-delete rows in `cascade` tables (rows that
 * are meaningless once the parent is gone). Returns the blocker summary strings.
 */
function resolveDependents(table, column, id, { cascade = [] } = {}) {
  const blockers = [];
  const tables = getAll(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).map((r) => r.name);
  for (const t of tables) {
    if (t === table || !tableColumns(t).includes(column)) continue;
    const row = getOne(`SELECT COUNT(*) AS c FROM ${t} WHERE ${column} = ?`, [id]);
    const count = row ? Number(row.c) : 0;
    if (!count) continue;
    if (cascade.includes(t)) {
      run(`DELETE FROM ${t} WHERE ${column} = ?`, [id]);
    } else {
      blockers.push(`${count} ${t.replace(/_/g, ' ')}`);
    }
  }
  return blockers;
}

router.delete('/districts/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOne('SELECT * FROM districts WHERE districtId = ?', [id]);
  if (!existing) return envelope(res, 'District not found', null, 404);
  const blockers = resolveDependents('districts', 'districtId', id);
  if (blockers.length) {
    return envelope(
      res,
      `Cannot delete district "${existing.districtName}" — still referenced by: ${blockers.join(', ')}. Remove those first.`,
      null,
      409,
    );
  }
  run('DELETE FROM districts WHERE districtId = ?', [id]);
  return envelope(res, 'District deleted', null);
});

router.delete('/campuses/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOne('SELECT * FROM campuses WHERE campusId = ?', [id]);
  if (!existing) return envelope(res, 'Campus not found', null, 404);
  // grade associations are meaningless without the campus — cascade them
  const blockers = resolveDependents('campuses', 'campusId', id, { cascade: ['campus_grades'] });
  if (blockers.length) {
    return envelope(
      res,
      `Cannot delete campus "${existing.campusName}" — still referenced by: ${blockers.join(', ')}. Remove those first.`,
      null,
      409,
    );
  }
  run('DELETE FROM campuses WHERE campusId = ?', [id]);
  return envelope(res, 'Campus deleted', null);
});


// district-subjects list + sync
router.get('/district-subjects', (req, res) => {
  const districtId = Number(req.query.districtId || 0);
  const rows = getAll(`
    SELECT ds.districtSubjectId, ds.districtId, ds.subjectId, ds.isActive,
           s.subjectCode, s.subjectName
    FROM district_subjects ds JOIN subjects s ON s.subjectId = ds.subjectId
    WHERE ds.districtId = ? ORDER BY ds.districtSubjectId
  `, [districtId]);
  const data = rows.map((r) => ({ ...r, isActive: !!r.isActive }));
  return envelope(res, 'Success', data);
});

router.put('/district-subjects/sync', (req, res) => {
  const { districtId, subjectIds = [], updatedBy } = req.body || {};
  if (!districtId) return envelope(res, 'districtId is required', null, 400);
  run('DELETE FROM district_subjects WHERE districtId = ?', [Number(districtId)]);
  let count = 0;
  for (const sid of subjectIds) {
    const s = getOne('SELECT * FROM subjects WHERE subjectId = ?', [Number(sid)]);
    if (!s) continue;
    insert('INSERT INTO district_subjects (districtId, subjectId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
      [Number(districtId), Number(sid), 1, nowIso(), updatedBy || 'local-api']);
    count++;
  }
  return envelope(res, `Synced ${count} district subjects`, { districtId, subjectIds, count });
});

// POST /district-subjects — link one subject to a district (District Profile → Subjects → Add).
router.post('/district-subjects', (req, res) => {
  const { districtId, subjectId, isActive = true, createdBy } = req.body || {};
  if (!districtId || !subjectId) return envelope(res, 'districtId and subjectId are required', null, 400);
  const subject = getOne('SELECT * FROM subjects WHERE subjectId = ?', [Number(subjectId)]);
  if (!subject) return envelope(res, 'Subject not found', null, 404);
  const dupe = getOne('SELECT districtSubjectId FROM district_subjects WHERE districtId = ? AND subjectId = ?', [Number(districtId), Number(subjectId)]);
  if (dupe) return envelope(res, 'That subject is already linked to this district', null, 409);
  const id = insert('INSERT INTO district_subjects (districtId, subjectId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
    [Number(districtId), Number(subjectId), asBool(isActive, true) ? 1 : 0, nowIso(), createdBy || 'local-api']);
  const row = getOne(`
    SELECT ds.districtSubjectId, ds.districtId, ds.subjectId, ds.isActive, s.subjectCode, s.subjectName
    FROM district_subjects ds JOIN subjects s ON s.subjectId = ds.subjectId
    WHERE ds.districtSubjectId = ?
  `, [id]);
  return envelope(res, 'District subject saved', { ...row, isActive: !!row.isActive });
});

// PUT /district-subjects/:id — toggle a district's link status (Activate/Deactivate per district).
router.put('/district-subjects/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOne('SELECT * FROM district_subjects WHERE districtSubjectId = ?', [id]);
  if (!existing) return envelope(res, 'District subject not found', null, 404);
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.isActive !== undefined) { sets.push('[isActive] = ?'); vals.push(asBool(body.isActive, true) ? 1 : 0); }
  if (!sets.length) return envelope(res, 'Nothing to update', null, 400);
  sets.push('[updatedAt] = ?', '[updatedBy] = ?');
  vals.push(nowIso(), body.updatedBy || 'local-api', id);
  run(`UPDATE district_subjects SET ${sets.join(', ')} WHERE districtSubjectId = ?`, vals);
  const row = getOne(`
    SELECT ds.districtSubjectId, ds.districtId, ds.subjectId, ds.isActive, s.subjectCode, s.subjectName
    FROM district_subjects ds JOIN subjects s ON s.subjectId = ds.subjectId
    WHERE ds.districtSubjectId = ?
  `, [id]);
  return envelope(res, 'District subject updated', { ...row, isActive: !!row.isActive });
});

// campus-grades list + sync + post/put (CampusGradeItemDto with campusCode/campusName/gradeCode/gradeName)
router.get('/campus-grades', (req, res) => {
  const conds = [];
  const params = [];
  const { where, params: p } = filterable(req, ['districtId', 'campusId', 'gradeId']);
  conds.push(...where); params.push(...p);
  const ao = activeOnlyFlag(req);
  if (ao === true) { conds.push('cg.isActive = ?'); params.push(1); }
  const whereSql = conds.length ? `WHERE ${conds.map((c) => c.replace('districtId', 'cg.districtId').replace('campusId', 'cg.campusId').replace('gradeId', 'cg.gradeId')).join(' AND ')}` : '';
  const rows = getAll(`
    SELECT cg.campusGradeId, cg.districtId, cg.campusId, cg.gradeId, cg.isActive,
           c.campusCode, c.campusName, g.gradeCode, g.gradeName
    FROM campus_grades cg
    JOIN campuses c ON c.campusId = cg.campusId
    JOIN grades g ON g.gradeId = cg.gradeId
    ${whereSql}
    ORDER BY c.campusName, g.sortOrder
  `, params);
  const data = rows.map((r) => ({ ...r, isActive: !!r.isActive }));
  return envelope(res, 'Success', data);
});

router.post('/campus-grades', (req, res) => {
  const { districtId, campusId, gradeId, isActive, createdBy } = req.body || {};
  if (!districtId || !campusId || !gradeId) return envelope(res, 'districtId, campusId and gradeId are required', null, 400);
  const id = insert('INSERT INTO campus_grades (districtId, campusId, gradeId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
    [Number(districtId), Number(campusId), Number(gradeId), asBool(isActive, true) ? 1 : 0, nowIso(), createdBy || 'local-api']);
  const row = getOne(`
    SELECT cg.*, c.campusCode, c.campusName, g.gradeCode, g.gradeName
    FROM campus_grades cg
    JOIN campuses c ON c.campusId = cg.campusId
    JOIN grades g ON g.gradeId = cg.gradeId
    WHERE cg.campusGradeId = ?
  `, [id]);
  return envelope(res, 'Campus grade saved', row);
});

router.put('/campus-grades/sync', (req, res) => {
  const { districtId, campusId, gradeIds = [], updatedBy } = req.body || {};
  if (!districtId || !campusId) return envelope(res, 'districtId and campusId are required', null, 400);
  run('DELETE FROM campus_grades WHERE districtId = ? AND campusId = ?', [Number(districtId), Number(campusId)]);
  let count = 0;
  for (const gid of gradeIds) {
    insert('INSERT INTO campus_grades (districtId, campusId, gradeId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
      [Number(districtId), Number(campusId), Number(gid), 1, nowIso(), updatedBy || 'local-api']);
    count++;
  }
  return envelope(res, `Synced ${count} campus grades`, { districtId, campusId, gradeIds, count });
});

// roles (RolesService — coerces array from data, or object with roles/items/content)
router.get('/roles', (req, res) => {
  const rows = getAll(`
    SELECT 1 AS roleId, 'SuperAdmin' AS roleName, 'Full platform access across all districts and campuses.' AS roleDescription, 1 AS isActive
    UNION ALL SELECT 2, 'DistrictAdmin', 'Manage users, campuses, and reports for your district.', 1
    UNION ALL SELECT 3, 'Principal', 'View and manage data for your assigned campus.', 1
    UNION ALL SELECT 4, 'Teacher', 'View and manage data for your assigned classrooms.', 1
    ORDER BY roleId
  `);
  return envelope(res, 'Success', rows);
});

router.use((req, res) => {
  envelope(res, `Endpoint not found: ${req.method} ${req.originalUrl}`, null, 404);
});

module.exports = router;
