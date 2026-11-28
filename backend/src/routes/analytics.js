'use strict';
/**
 * Analytics endpoints: growth, attendance, CCMR, dashboard, standards,
 * teachers, teacher-assessment, mobility and student growth records.
 * All responses computed from the seeded SQLite data.
 */
const express = require('express');
const { getOne, getAll, insert, run, nowIso } = require('../db');
const { round, pad2, upperOrNull, gradeLetter, asBoolOrNull, asNumberOrNull, MONTHS } = require('../util');

const router = express.Router();

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

// ------------------------------------------------------------------ helpers
function rowToDog(row) {
  return row;
}

function getInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGradeFilter(v) {
  if (v === undefined || v === null || v === '') return null;
  return Array.isArray(v) ? v.map((x) => pad2(x)) : [pad2(v)];
}

function normalizeSubjectFilter(v) {
  if (v === undefined || v === null || v === '') return null;
  return Array.isArray(v) ? v.map((x) => String(x).trim()) : [String(v).trim()];
}

/** Builds the WHERE-clause for student_growth_records analytics queries from a request body. */
function growthRecordWhere(body, campusCodeField = 'campusCode') {
  const conds = ['districtId = ?', 'academicYearId = ?', 'quarterCode = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0, upperOrNull(body.quarterCode) || ''];
  if (body.campusCode) { conds.push(`${campusCodeField} = ?`); params.push(String(body.campusCode).toUpperCase()); }
  if (body.campusCategoryId !== undefined && body.campusCategoryId !== null && body.campusCategoryId !== '') {
    const campusCodes = getAll('SELECT campusCode FROM campuses WHERE campusCategoryId = ?', [Number(body.campusCategoryId)]).map((r) => r.campusCode);
    conds.push(`${campusCodeField} IN (${campusCodes.length ? campusCodes.map(() => '?').join(',') : "''"})`);
    params.push(...campusCodes.map((c) => c));
  }
  if (body.teacherId !== undefined && body.teacherId !== null && body.teacherId !== '' && Number(body.teacherId) > 0) {
    const t = getOne('SELECT * FROM teachers WHERE teacherId = ?', [Number(body.teacherId)]);
    if (t) {
      conds.push('(teacherIdExternal = ? OR teacherName = ?)');
      params.push(t.teacherIdExternal ?? '', `${t.lastName}, ${t.firstName}`);
    } else {
      conds.push('teacherIdExternal = ?');
      params.push(`ext-T${Number(body.teacherId)}`);
    }
  }
  const grades = normalizeGradeFilter(body.grade);
  if (grades && grades.length) {
    conds.push(`gradeCode IN (${grades.map(() => '?').join(',')})`);
    params.push(...grades);
  }
  const subjects = normalizeSubjectFilter(body.subject);
  if (subjects && subjects.length) {
    conds.push(`subjectCode IN (${subjects.map(() => '?').join(',')})`);
    params.push(...subjects);
  }
  if (body.specialEducation !== undefined && body.specialEducation !== null) {
    conds.push('specialEducation = ?'); params.push(asBoolOrNull(body.specialEducation) ? 1 : 0);
  }
  if (body.economicDisadvantage !== undefined && body.economicDisadvantage !== null) {
    conds.push('economicDisadvantage = ?'); params.push(asBoolOrNull(body.economicDisadvantage) ? 1 : 0);
  }
  if (body.emergentBilingual !== undefined && body.emergentBilingual !== null && body.emergentBilingual !== '') {
    conds.push('emergentBilingual = ?'); params.push(String(body.emergentBilingual) === 'Y' ? 1 : 0);
  }
  if (body.ethnicity) { conds.push('ethnicity = ?'); params.push(String(body.ethnicity)); }
  if (body.testLanguage) { conds.push('testLang = ?'); params.push(String(body.testLanguage)); }
  return { conds, params };
}

function queryStudentGrowth(body, filters) {
  const q = growthRecordWhere(body);
  const extraWhere = filters || [];
  const conds = [...q.conds, ...extraWhere.map((c) => c.sql)];
  const params = [...q.params, ...extraWhere.flatMap((c) => c.params)];
  const sql = `SELECT * FROM student_growth_records WHERE ${conds.join(' AND ')}`;
  return getAll(sql, params);
}

function agg(rows) {
  if (!rows || !rows.length) {
    return { app: null, meet: null, master: null, cs: null, growth: null };
  }
  const mean = (sel) => {
    const vals = rows.map(sel).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)));
    if (!vals.length) return null;
    return round(vals.reduce((a, b) => a + Number(b), 0) / vals.length, 1);
  };
  return {
    app: mean((r) => r.app),
    meet: mean((r) => r.meets),
    master: mean((r) => r.masters),
    cs: mean((r) => r.cs),
    growth: mean((r) => r.growth),
  };
}

// ------------------------------------------------------------------ growth
router.post('/growth/overall-metrics', (req, res) => {
  const rows = queryStudentGrowth(req.body);
  const a = agg(rows);
  const categories = getAll('SELECT * FROM campus_categories ORDER BY campusCategoryId');
  const gradesByCategory = categories.map((c) => {
    const codes = getAll('SELECT campusCode FROM campuses WHERE campusCategoryId = ?', [c.campusCategoryId]).map((r) => r.campusCode);
    const sub = rows.filter((r) => codes.includes(r.campusCode));
    const ca = agg(sub);
    const body = { ...req.body, campusCategoryId: c.campusCategoryId };
    const perCampusRows = sub.length ? sub : queryStudentGrowth(body);
    const ca2 = ca.growth === null ? agg(perCampusRows) : ca;
    return {
      campusCategoryId: c.campusCategoryId,
      categoryCode: c.categoryCode,
      categoryName: c.categoryName,
      cs: ca2.cs,
      csGrade: gradeLetter(ca2.cs),
      growth: ca2.growth,
      growthGrade: gradeLetter(ca2.growth),
    };
  });
  return envelope(res, 'Success', {
    app: a.app,
    meet: a.meet,
    master: a.master,
    cs: a.cs,
    growth: a.growth,
    csGrade: gradeLetter(a.cs),
    growthGrade: gradeLetter(a.growth),
    gradesByCategory,
  });
});

router.post('/growth/campus-metrics', (req, res) => {
  const campuses = getAll('SELECT * FROM campuses WHERE districtId = ? ORDER BY campusId', [getInt(req.body.districtId) ?? 0]);
  const rows = queryStudentGrowth(req.body);
  const data = campuses.filter((c) => {
    if (!rows.length) return true;
    return rows.some((r) => r.campusCode === c.campusCode);
  }).map((c) => {
    const sub = rows.filter((r) => r.campusCode === c.campusCode);
    const a = agg(sub);
    return {
      campusId: c.campusId,
      campusCode: c.campusCode,
      campusName: c.campusName,
      componentScore: a.cs,
      growth: a.growth,
    };
  });
  return envelope(res, 'Success', data);
});

router.post('/growth/campus-category-metrics', (req, res) => {
  const categories = getAll('SELECT * FROM campus_categories ORDER BY campusCategoryId');
  const rows = queryStudentGrowth(req.body);
  const data = categories.map((c) => {
    const codes = getAll('SELECT campusCode FROM campuses WHERE campusCategoryId = ?', [c.campusCategoryId]).map((r) => r.campusCode);
    const sub = rows.filter((r) => codes.includes(r.campusCode));
    const a = agg(sub);
    return {
      campusCategoryId: c.campusCategoryId,
      campusCategoryName: c.categoryName,
      componentScore: a.cs,
      growth: a.growth,
    };
  });
  return envelope(res, 'Success', data);
});

router.post('/growth/campus-teacher-metrics', (req, res) => {
  const body = { ...req.body };
  const rows = queryStudentGrowth(body);
  const teachers = getAll('SELECT t.*, c.campusCode FROM teachers t JOIN campuses c ON c.campusId = t.campusId WHERE c.campusCode = ? ORDER BY t.teacherId', [upperOrNull(body.campusCode) || '']);
  const campusName = getOne('SELECT campusName FROM campuses WHERE campusCode = ?', [upperOrNull(body.campusCode) || '']);
  const teacherRows = rows.filter((r) => teachers.some((t) => t.teacherIdExternal === r.teacherIdExternal));
  const byTeacher = new Map();
  for (const r of teacherRows) {
    if (!byTeacher.has(r.teacherIdExternal)) byTeacher.set(r.teacherIdExternal, []);
    byTeacher.get(r.teacherIdExternal).push(r);
  }
  const data = [];
  const sharedLevels = new Map();
  for (const t of teachers) {
    const key = t.teacherIdExternal;
    const sub = byTeacher.get(key) || teacherKeyFromName(rows, `${t.lastName}, ${t.firstName}`);
    if (!sub || !sub.length) continue;
    const a = agg(sub);
    const gradeRow = getOne('SELECT gradeCode FROM grades WHERE gradeId = ?', [t.gradeId]);
    /**
     * The portal's app/meets/masters columns are carried on student-level rows. When
     * the same students (and therefore the same band values) feed more than one
     * classroom, those figures describe the students/grade, not an individual
     * classroom. Mark them as not derivable rather than copying them into each row.
     */
    const studentKey = sub
      .map((r) => `${r.localId ?? ''}:${r.studentName ?? ''}`)
      .sort()
      .join('|');
    const levelKey = `${a.app}|${a.meet}|${a.master}::${studentKey}`;
    sharedLevels.set(levelKey, (sharedLevels.get(levelKey) || 0) + 1);
    data.push({
      teacherId: t.teacherId,
      teacherIdExternal: t.teacherIdExternal,
      firstName: t.firstName,
      lastName: t.lastName,
      grade: gradeRow ? gradeRow.gradeCode : null,
      componentScore: a.cs ?? 0,
      growth: a.growth ?? 0,
      app: a.app,
      meet: a.meet,
      master: a.master,
      levelKey,
    });
  }
  function teacherKeyFromName(list, name) {
    const filtered = list.filter((r) => String(r.teacherName || '').trim() === String(name).trim());
    return filtered.length ? filtered : null;
  }
  return envelope(
    res,
    'Success',
    data.map((d) => {
      const notClassroomSpecific = (sharedLevels.get(d.levelKey) || 0) > 1;
      const { levelKey, ...row } = d;
      return {
        ...row,
        app: notClassroomSpecific ? null : row.app,
        meet: notClassroomSpecific ? null : row.meet,
        master: notClassroomSpecific ? null : row.master,
        campusName: campusName ? campusName.campusName : null,
        teacherName: d.teacherIdExternal,
      };
    }),
  );
});

router.post('/growth/top-classrooms', (req, res) => {
  const body = { ...req.body };
  // map gradeCode/subjectCode arrays to grade/subject
  body.grade = normalizeGradeFilter(body.gradeCode) || normalizeGradeFilter(body.grade);
  body.subject = normalizeSubjectFilter(body.subjectCode) || normalizeSubjectFilter(body.subject);
  if (body.campusCategoryCode) {
    const cat = getOne('SELECT campusCategoryId FROM campus_categories WHERE categoryCode = ?', [String(body.campusCategoryCode).toUpperCase()]);
    if (cat) body.campusCategoryId = cat.campusCategoryId;
  }
  const rows = queryStudentGrowth(body);
  const top = Math.max(1, getInt(body.top) || 5);
  // group by teacherName, average growth + cs
  const byTeacher = new Map();
  for (const r of rows) {
    const name = String(r.teacherName || '').trim();
    if (!name) continue; // student with no assigned teacher — not a real classroom
    if (!byTeacher.has(name)) byTeacher.set(name, []);
    byTeacher.get(name).push(r);
  }
  const teacherMetrics = [];
  for (const [name, list] of byTeacher) {
    const a = agg(list);
    const parts = name.split(',');
    const firstName = parts[1] ? parts[1].trim() : name;
    const lastName = parts[0].trim();
    teacherRowsExternal:
    teacherMetrics.push({
      teacherIdExternal: list[0].teacherIdExternal,
      firstName,
      lastName,
      grade: list[0].gradeCode,
      componentScore: a.cs ?? 0,
      growth: a.growth ?? 0,
    });
  }
  teacherMetrics.sort((x, y) => (y.growth || 0) - (x.growth || 0));
  const data = teacherMetrics.slice(0, top).map((t, i) => ({
    teacherId: i + 1,
    teacherIdExternal: t.teacherIdExternal,
    firstName: t.firstName,
    lastName: t.lastName,
    grade: t.grade,
    componentScore: t.componentScore,
    growth: t.growth,
  }));
  return envelope(res, 'Success', data);
});

router.post('/growth/top-students', (req, res) => {
  const body = { ...req.body };
  body.grade = normalizeGradeFilter(body.gradeCode) || normalizeGradeFilter(body.grade);
  body.subject = normalizeSubjectFilter(body.subjectCode) || normalizeSubjectFilter(body.subject);
  const rows = queryStudentGrowth(body);
  const campusNameByCode = new Map(getAll('SELECT campusCode, campusName FROM campuses').map((r) => [r.campusCode, r.campusName]));
  const top = Math.max(1, getInt(body.top) || 5);
  const data = rows
    .filter((r) => !body.campusCode || r.campusCode === String(body.campusCode).toUpperCase())
    .sort((a, b) => (b.growth || 0) - (a.growth || 0))
    .slice(0, top)
    .map((r) => ({
      campusName: campusNameByCode.get(r.campusCode) || r.campusCode,
      studentName: r.studentName,
      grade: r.gradeCode,
      growth: r.growth ?? 0,
      componentScore: r.cs ?? 0,
    }));
  return envelope(res, 'Success', data);
});

router.post('/growth/campus-teacher-student-metrics', (req, res) => {
  const body = { ...req.body };
  const rows = queryStudentGrowth(body);
  const teacher = body.teacherId ? getOne('SELECT * FROM teachers WHERE teacherId = ?', [Number(body.teacherId)]) : null;
  const filtered = teacher
    ? rows.filter((r) => r.teacherIdExternal === teacher.teacherIdExternal
      || (r.teacherName === `${teacher.lastName}, ${teacher.firstName}`))
    : rows;
  const campusNameByCode = new Map(getAll('SELECT campusCode, campusName FROM campuses').map((r) => [r.campusCode, r.campusName]));
  const data = filtered.map((r) => ({
    campusName: campusNameByCode.get(r.campusCode) || r.campusCode,
    studentName: r.studentName,
    grade: r.gradeCode,
    subjectCode: r.subjectCode,
    growth: r.growth ?? 0,
    componentScore: r.cs ?? 0,
  }));
  return envelope(res, 'Success', data);
});

// ------------------------------------------------------------------ attendance
function campusAttendanceBase(body) {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0];
  if (body.campusId) {
    const campus = getOne('SELECT campusCode FROM campuses WHERE campusId = ?', [Number(body.campusId)]);
    if (campus) { conds.push('campusCode = ?'); params.push(campus.campusCode); }
  }
  return { conds, params };
}

router.post('/campus-attendance/monthly-stats', (req, res) => {
  const { conds, params } = campusAttendanceBase(req.body);
  const rows = getAll(`
    SELECT substr(attendanceDate, 1, 7) AS ym, attendanceDate, campusAdaPct, estimatedMissedFinance, enrollment, studentsAbsent, campusCode
    FROM campus_attendance_daily WHERE ${conds.join(' AND ')} ORDER BY attendanceDate
  `, params);
  const byMonth = new Map();
  for (const r of rows) {
    const monthName = MONTHS[Number(r.ym.split('-')[1]) - 1];
    if (!byMonth.has(monthName)) byMonth.set(monthName, { ada: [], finance: [] });
    const bucket = byMonth.get(monthName);
    bucket.ada.push(r.campusAdaPct);
    bucket.finance.push(estimateMissedFinance(r, bucket));
    bucket.finance[bucket.finance.length - 1] = Number(r.estimatedMissedFinance ?? 0);
  }
  const orderedMonths = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May'];
  const data = orderedMonths
    .filter((m) => byMonth.has(m))
    .map((m) => ({
      month: m,
      averageAdaPct: round(byMonth.get(m).ada.reduce((a, b) => a + Number(b), 0) / byMonth.get(m).ada.length, 1),
      estimatedMissedFinance: Math.round(byMonth.get(m).finance.reduce((a, b) => a + Number(b), 0)),
    }));
  return envelope(res, 'Success', data);
});

function estimateMissedFinance(row) {
  return Number(row.estimatedMissedFinance ?? 0);
}

router.post('/campus-attendance/ada-summary', (req, res) => {
  const { conds, params } = campusAttendanceBase(req.body);
  const rows = getAll(`
    SELECT substr(attendanceDate, 1, 7) AS ym, campusAdaPct, estimatedMissedFinance, studentsAbsent
    FROM campus_attendance_daily WHERE ${conds.join(' AND ')} ORDER BY attendanceDate
  `, params);
  const orderedMonths = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May'];
  const allAda = orderedMonths
    .map((m) => {
      const subset = rows.filter((r) => MONTHS[Number(r.ym.split('-')[1]) - 1] === m);
      if (!subset.length) return null;
      return round(subset.reduce((a, r) => a + Number(r.campusAdaPct), 0) / subset.length, 1);
    })
    .filter((v) => v !== null);
  const totalStudents = getAll(`
    SELECT COUNT(*) AS c FROM (SELECT DISTINCT localId FROM student_growth_records WHERE districtId = ? AND academicYearId = ?)
  `, [getInt(req.body.districtId) ?? 0, getInt(req.body.academicYearId) ?? 0])[0]?.c ?? 0;
  const noStudentAbsents = rows.reduce((a, r) => a + (Number(r.studentsAbsent) > 0 ? 1 : 0), 0);
  const averageAda = allAda.length
    ? round(allAda.reduce((a, b) => a + b, 0) / allAda.length, 1)
    : null;
  return envelope(res, 'Success', {
    allAda: allAda.length ? allAda : [],
    totalStudents: totalStudents || 0,
    noStudentAbsents,
    averageAdaPct: averageAda,
  });
});

router.post('/campus-attendance/campus-wise-stats', (req, res) => {
  const { conds, params } = campusAttendanceBase(req.body);
  const rows = getAll(`
    SELECT campusCode, campusName, AVG(campusAdaPct) AS avgAda, SUM(studentsAbsent) AS absents, SUM(estimatedMissedFinance) AS finance
    FROM campus_attendance_daily WHERE ${conds.join(' AND ')} GROUP BY campusCode, campusName ORDER BY campusCode
  `, params);
  const data = rows.map((r) => ({
    campusName: r.campusName,
    numberStudentAbsent: Math.round(Number(r.absents ?? 0) / 8),
    averageAdaPct: round(r.avgAda, 1),
    estimatedMissedFinance: Math.round(Number(r.finance ?? 0) / 8),
  }));
  return envelope(res, 'Success', data);
});

router.post('/campus-attendance/campus-category-ada', (req, res) => {
  const raw = campusAttendanceBase(req.body);
  const conds = raw.conds.map((c) => c.replace(/^(districtId|academicYearId|campusCode)\b/, 'a.$1'));
  const rows = getAll(`
    SELECT c.campusCategoryId, cat.categoryCode, cat.categoryName, substr(a.attendanceDate, 1, 7) AS ym, a.campusAdaPct
    FROM campus_attendance_daily a
    JOIN campuses c ON c.campusCode = a.campusCode
    JOIN campus_categories cat ON cat.campusCategoryId = c.campusCategoryId
    WHERE ${conds.join(' AND ')} ORDER BY a.attendanceDate
  `, raw.params);
  const byCategory = new Map();
  for (const r of rows) {
    const key = r.categoryCode === 'ES' ? 'ElementarySchool' : r.categoryCode === 'MS' ? 'MiddleSchool' : 'HighSchool';
    const altKey = r.categoryCode === 'ES' ? 'Elementary School' : r.categoryCode === 'MS' ? 'Middle School' : 'High School';
    for (const k of [key, altKey]) {
      if (!byCategory.has(k)) byCategory.set(k, new Map());
    }
    const monthName = MONTHS[Number(r.ym.split('-')[1]) - 1];
    for (const k of [key, altKey]) {
      const m = byCategory.get(k);
      if (!m.has(monthName)) m.set(monthName, []);
      m.get(monthName).push(Number(r.campusAdaPct));
    }
  }
  const orderedMonths = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May'];
  const data = {};
  for (const [k, m] of byCategory) {
    data[k] = orderedMonths.map((mo) => {
      const list = m.get(mo);
      if (!list || !list.length) return null;
      return round(list.reduce((a, b) => a + b, 0) / list.length, 1);
    }).filter((v) => v !== null);
  }
  return envelope(res, 'Success', data);
});

router.post('/campus-attendance/lowest-ada-three-days', (req, res) => {
  const body = req.body || {};
  const month = body.month || null;
  const code = body.campusCode ? String(body.campusCode).toUpperCase() : null;
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.body.districtId) ?? 0, getInt(req.body.academicYearId) ?? 0];
  let rows;
  if (month) {
    rows = getAll(`
      SELECT campusCode, campusName, attendanceDate, campusAdaPct, enrollment, studentsAbsent, dayOfWeek
      FROM campus_attendance_daily WHERE ${conds.join(' AND ')} ORDER BY campusAdaPct ASC
    `, params);
  } else {
    rows = getAll(`
      SELECT campusCode, campusName, attendanceDate, campusAdaPct, enrollment, studentsAbsent, dayOfWeek
      FROM campus_attendance_daily WHERE ${conds.join(' AND ')} ORDER BY campusAdaPct ASC
    `, params);
  }
  const filtered = code ? rows.filter((r) => r.campusCode === code) : rows;
  const campusesNeeded = code ? [code] : new Set(rows.map((r) => r.campusCode));
  const data = [];
  for (const cc of campusesNeeded) {
    const sub = filtered.filter((r) => r.campusCode === cc).slice(0, 3);
    for (const r of sub) {
      data.push({
        campusCode: r.campusCode,
        enrollment: r.enrollment,
        campusAdaPct: round(r.campusAdaPct, 1),
        noOfStudentAbsent: r.studentsAbsent,
        lowestAdaDayWeekday: r.dayOfWeek,
      });
    }
  }
  return envelope(res, 'Success', data);
});

router.get('/campus-attendance/records', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0];
  if (req.query.campusCode) { conds.push('campusCode = ?'); params.push(String(req.query.campusCode).toUpperCase()); }
  const rows = getAll(`
    SELECT * FROM campus_attendance_daily WHERE ${conds.join(' AND ')} ORDER BY attendanceDate DESC, campusCode
  `, params);
  const data = rows.map((r) => ({
    campusCode: r.campusCode,
    campusName: r.campusName,
    attendanceDate: r.attendanceDate,
    dayOfWeek: r.dayOfWeek,
    campusAdaPct: round(r.campusAdaPct, 2),
    enrollment: r.enrollment,
    studentAbsents: r.studentsAbsent,
    estimatedMissed: Math.round(Number(r.estimatedMissed ?? 0)),
    absGoal: r.absGoal ?? null,
  }));
  return envelope(res, 'Success', data);
});

// individual attendance
router.post('/individual-attendance/student-stats', (req, res) => {
  const rows = individualRows(req.body);
  if (!rows.length) {
    return envelope(res, 'Success', { totalNumberOfStudents: 0, studentsScoreRed: 0, studentsScoreYellow: 0, studentsScoreGreen: 0 });
  }
  const buckets = piaBuckets(rows);
  const total = rows.length;
  return envelope(res, 'Success', {
    totalNumberOfStudents: total,
    studentsScoreRed: round(buckets.red / total * 100, 1),
    studentsScoreYellow: round(buckets.yellow / total * 100, 1),
    studentsScoreGreen: round(buckets.green / total * 100, 1),
  });
});

router.post('/individual-attendance/student-stats/by-campus', (req, res) => {
  const rows = individualRows(req.body);
  const campuses = getAll('SELECT campusId, campusCode, campusName FROM campuses WHERE districtId = ?', [getInt(req.body.districtId) ?? 0]);
  const data = campuses.map((c) => {
    const sub = rows.filter((r) => r.campusCode === c.campusCode);
    const buckets = piaBuckets(sub);
    return {
      campusId: c.campusId,
      campusCode: c.campusCode,
      campusName: c.campusName,
      totalNumberOfStudents: sub.length,
      studentsScoreRed: sub.length ? round(buckets.red / sub.length * 100, 1) : 0,
      studentsScoreYellow: sub.length ? round(buckets.yellow / sub.length * 100, 1) : 0,
      studentsScoreGreen: sub.length ? round(buckets.green / sub.length * 100, 1) : 0,
    };
  }).filter((d) => d.totalNumberOfStudents > 0);
  return envelope(res, 'Success', data);
});

router.get('/individual-attendance/records', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0];
  if (req.query.quarterCode) { conds.push('quarterCode = ?'); params.push(String(req.query.quarterCode).toUpperCase()); }
  if (req.query.campusCode) { conds.push('campusCode = ?'); params.push(String(req.query.campusCode).toUpperCase()); }
  const piaMin = asNumberOrNull(req.query.piaMin);
  const piaMax = asNumberOrNull(req.query.piaMax);
  if (piaMin !== null) { conds.push('totalPia >= ?'); params.push(piaMin); }
  if (piaMax !== null) { conds.push('totalPia <= ?'); params.push(piaMax); }
  const rows = getAll(`SELECT * FROM individual_attendance_records WHERE ${conds.join(' AND ')} ORDER BY totalPia ASC`, params);
  const data = rows.map((r) => ({
    localId: r.localId,
    firstName: r.firstName,
    lastName: r.lastName,
    totalDaysMembership: r.totalDaysMembership,
    totalDaysAbsent: r.totalDaysAbsent,
    totalPia: round(r.totalPia, 1),
  }));
  return envelope(res, 'Success', data);
});

function individualRows(body) {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0];
  if (body.quarterCode) { conds.push('quarterCode = ?'); params.push(String(body.quarterCode).toUpperCase()); }
  if (body.campusId) {
    const campus = getOne('SELECT campusCode FROM campuses WHERE campusId = ?', [Number(body.campusId)]);
    if (campus) { conds.push('campusCode = ?'); params.push(campus.campusCode); }
  }
  return getAll(`SELECT * FROM individual_attendance_records WHERE ${conds.join(' AND ')}`, params);
}

function piaBuckets(rows) {
  let red = 0, yellow = 0, green = 0;
  for (const r of rows) {
    const pia = Number(r.totalPia ?? 0);
    if (pia < 90) red++;
    else if (pia < 95) yellow++;
    else green++;
  }
  return { red, yellow, green };
}

// ------------------------------------------------------------------ CCMR
function ccmrMonthStatsRows(body, requireCalendarMonth) {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0];
  let calendarMonth = body.calendarMonth ? String(body.calendarMonth) : null;
  if (!calendarMonth && !requireCalendarMonth) {
    const latest = getOne(
      'SELECT calendarMonth FROM ccmr_academy_month_stats WHERE districtId = ? AND academicYearId = ? ORDER BY id DESC',
      [params[0], params[1]],
    );
    calendarMonth = latest ? latest.calendarMonth : null;
  }
  if (calendarMonth) {
    const monthOrder = MONTHS.indexOf(calendarMonth) >= 0 ? MONTHS.indexOf(calendarMonth) : null;
    const all = getAll(`SELECT * FROM ccmr_academy_month_stats WHERE ${conds.join(' AND ')} ORDER BY id`, params);
    const monthsOfYear = [...new Set(all.map((r) => r.calendarMonth))].sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
    if (monthsOfYear.length) {
      const idx = monthsOfYear.indexOf(calendarMonth);
      const effective = idx >= 0 ? calendarMonth : monthsOfYear[monthsOfYear.length - 1];
      conds.push('calendarMonth = ?'); params.push(effective);
      return { rows: getAll(`SELECT * FROM ccmr_academy_month_stats WHERE ${conds.join(' AND ')}`, params), calendarMonth: effective };
    }
  }
  return { rows: getAll(`SELECT * FROM ccmr_academy_month_stats WHERE ${conds.join(' AND ')}`, params), calendarMonth: null };
}

router.get('/ccmr/monthly-rates', (req, res) => {
  const meta = ccmrMonthStatsRows(req.body || {}, true);
  return envelope(res, 'Success', []);
});
router.post('/ccmr/monthly-rates', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.body.districtId) ?? 0, getInt(req.body.academicYearId) ?? 0];
  const rows = getAll(`SELECT * FROM ccmr_monthly_rates WHERE ${conds.join(' AND ')} ORDER BY id`, params);
  return envelope(res, 'Success', rows.map((r) => ({ month: r.calendarMonth, gradeRate: round(r.gradeRate, 1), ccmrRate: round(r.ccmrRate, 1) })));
});

router.get('/ccmr/academy-stats', (req, res) => {
  return handleCcmrAcademyStats(req, res);
});
router.post('/ccmr/academy-stats', (req, res) => {
  return handleCcmrAcademyStats(req, res);
});

function handleCcmrAcademyStats(req, res) {
  const body = req.body || {};
  let { rows, calendarMonth } = ccmrMonthStatsRows(body, false);
  if (body.calendarMonth) {
    const filtered = rows.filter((r) => r.calendarMonth.toLowerCase() === String(body.calendarMonth).toLowerCase());
    if (filtered.length) { rows = filtered; calendarMonth = body.calendarMonth; }
  }
  const data = rows.map((r) => ({
    school: r.school,
    totalStudent: r.totalStudent,
    ccmr: round(r.ccmr, 1),
    gradRate: round(r.gradRate, 1),
    onTrack: round(r.onTrack, 1),
    likely: round(r.likely, 1),
    notLikely: round(r.notLikely, 1),
  }));
  return envelope(res, 'Success', data);
}

router.get('/ccmr/academy-grad-rate-by-month', (req, res) => {
  return handleCcmrGradRate(req, res);
});
router.post('/ccmr/academy-grad-rate-by-month', (req, res) => {
  return handleCcmrGradRate(req, res);
});

function handleCcmrGradRate(req, res) {
  const body = req.body || {};
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0];
  const rows = getAll(`SELECT * FROM ccmr_academy_month_stats WHERE ${conds.join(' AND ')} ORDER BY id`, params);
  const bySchool = new Map();
  for (const r of rows) {
    if (!bySchool.has(r.school)) bySchool.set(r.school, new Map());
    const m = bySchool.get(r.school);
    if (!m.has(r.calendarMonth)) m.set(r.calendarMonth, round(r.gradRate, 1));
  }
  const orderedMonths = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April'];
  const data = [...bySchool.entries()].map(([school, m]) => ({
    school,
    months: orderedMonths.filter((mo) => m.has(mo)).map((mo) => ({ calendarMonth: mo, gradRate: m.get(mo) })),
  }));
  return envelope(res, 'Success', data);
}

router.get('/ccmr/records', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0];
  if (req.query.calendarMonth) { conds.push('calendarMonth = ?'); params.push(String(req.query.calendarMonth)); }
  if (req.query.academyCode) { conds.push('academyCode = ?'); params.push(String(req.query.academyCode).toUpperCase()); }
  const rows = getAll(`SELECT * FROM ccmr_records WHERE ${conds.join(' AND ')} ORDER BY recordId`, params);
  const data = rows.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    studentId: r.studentId,
    school: r.school,
    credit: r.credit,
    campus: r.campus,
    grade: r.grade,
    planA: r.planA,
    planB: r.planB,
    ccmrMet: !!r.ccmrMet,
  }));
  return envelope(res, 'Success', data);
});

// ------------------------------------------------------------------ dashboard
router.get('/dashboard/overall-percentages', (req, res) => {
  return handleDashboard(req, res);
});
router.post('/dashboard/overall-percentages', (req, res) => {
  return handleDashboard(req, res);
});

function handleDashboard(req, res) {
  const body = req.body || {};
  const districtId = getInt(body.districtId) ?? 0;
  const academicYearId = getInt(body.academicYearId) ?? 0;
  // No metrics for this district+year → honest empty state, never another district's row.
  const metrics = getOne('SELECT * FROM dashboard_metrics WHERE districtId = ? AND academicYearId = ?', [districtId, academicYearId]);
  let calendarMonth = body.calendarMonth || null;
  if (!calendarMonth) {
    const latest = getOne(
      'SELECT calendarMonth FROM ccmr_academy_month_stats WHERE districtId = ? AND academicYearId = ? ORDER BY id DESC',
      [districtId, academicYearId],
    );
    calendarMonth = latest ? latest.calendarMonth : 'February';
  }
  let ccmrRate = metrics ? metrics.ccmrRate : null;
  if (calendarMonth) {
    const monthly = getOne('SELECT ccmrRate FROM ccmr_monthly_rates WHERE districtId = ? AND academicYearId = ? AND calendarMonth = ?',
      [districtId, academicYearId, calendarMonth]);
    if (monthly) ccmrRate = round(monthly.ccmrRate, 1);
  }
  return envelope(res, 'Success', {
    ccmrRate,
    graduationRate: metrics ? metrics.graduationRate : null,
    teachers: metrics ? metrics.teachers : null,
    calendarMonth,
  });
}

// ------------------------------------------------------------------ student standards
router.post('/student-standards/standard-averages', (req, res) => {
  const body = req.body || {};
  const quarterCode = upperOrNull(body.quarterCode);
  const campusCode = upperOrNull(body.campusCode);
  const gradeCode = pad2(body.gradeCode);
  const subjectCode = upperOrNull(body.subjectCode);
  const teacherId = asNumberOrNull(body.teacherId);
  const teacherExternal = teacherId ? getOne('SELECT teacherIdExternal FROM teachers WHERE teacherId = ?', [teacherId]) : null;

  let rows = getAll(
    'SELECT standardCode, AVG(average) AS avgScore FROM student_standards_averages WHERE districtId = ? AND academicYearId = ? AND quarterCode = ? AND campusCode = ? AND gradeCode = ? AND subjectCode = ? GROUP BY standardCode',
    [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0, quarterCode || '', campusCode || '', gradeCode || '', subjectCode || ''],
  );
  if (!rows.length) {
    // fall back to computing from score rows
    rows = getAll(
      'SELECT standardCode, AVG(score) AS avgScore FROM student_standards_scores WHERE districtId = ? AND academicYearId = ? AND quarterCode = ? AND campusCode = ? AND gradeCode = ? AND subjectCode = ? GROUP BY standardCode',
      [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0, quarterCode || '', campusCode || '', gradeCode || '', subjectCode || ''],
    );
  }
  const data = rows.map((r) => ({ standardCode: r.standardCode, average: round(r.avgScore, 0) }));
  return envelope(res, 'Success', data);
});

router.post('/student-standards/student-scores', (req, res) => {
  const body = req.body || {};
  const quarterCode = upperOrNull(body.quarterCode);
  const campusCode = upperOrNull(body.campusCode);
  const gradeCode = pad2(body.gradeCode);
  const subjectCode = upperOrNull(body.subjectCode);
  const teacherId = asNumberOrNull(body.teacherId);
  const conds = ['districtId = ?', 'academicYearId = ?', 'quarterCode = ?', 'campusCode = ?', 'gradeCode = ?', 'subjectCode = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0, quarterCode || '', campusCode || '', gradeCode || '', subjectCode || ''];
  if (teacherId) {
    const teacher = getOne('SELECT teacherIdExternal FROM teachers WHERE teacherId = ?', [teacherId]);
    if (teacher) { conds.push('teacherIdExternal = ?'); params.push(teacher.teacherIdExternal); }
  }
  const rows = getAll(`SELECT * FROM student_standards_scores WHERE ${conds.join(' AND ')} ORDER BY scoreId`, params);
  const byStudent = new Map();
  for (const r of rows) {
    const name = r.studentName;
    if (!byStudent.has(name)) byStudent.set(name, new Map());
    byStudent.get(name).set(`${r.standardCode}`, r);
  }
  const data = [];
  for (const [name, map] of byStudent) {
    const first = [...map.values()][0];
    const row = {
      studentName: name,
      score: null,
    };
    for (const [std, rec] of map) {
      row[std] = `${Math.round(Number(rec.score ?? 0))}%`;
    }
    const scores = [...map.values()].map((r) => Number(r.score ?? 0));
    row.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    row.gradeCode = first.gradeCode;
    row.subjectCode = first.subjectCode;
    data.push(row);
  }
  return envelope(res, 'Success', data);
});

// ------------------------------------------------------------------ teachers
router.get('/teachers/by-campus', (req, res) => {
  const conds = ['t.districtId = ?'];
  const params = [getInt(req.query.districtId) ?? 0];
  if (req.query.campusCode) {
    const campus = getOne('SELECT campusId FROM campuses WHERE campusCode = ?', [String(req.query.campusCode).toUpperCase()]);
    conds.push('t.campusId = ?');
    params.push(campus ? campus.campusId : -1);
  }
  const rows = getAll(
    `SELECT t.*, g.gradeName, s.subjectName FROM teachers t
     LEFT JOIN grades g ON g.gradeId = t.gradeId
     LEFT JOIN subjects s ON s.subjectId = t.subjectId
     WHERE ${conds.join(' AND ')} ORDER BY t.lastName, t.firstName`,
    params,
  );
  return envelope(res, 'Success', rows.map(teacherSummary));
});

router.post('/teachers/by-scope', (req, res) => {
  const body = req.body || {};
  const conds = ['t.districtId = ?'];
  const params = [getInt(body.districtId) ?? 0];
  if (body.campusCode) {
    const campus = getOne('SELECT campusId FROM campuses WHERE campusCode = ?', [String(body.campusCode).toUpperCase()]);
    conds.push('t.campusId = ?');
    params.push(campus ? campus.campusId : -1);
  }
  const gradeCode = body.gradeCode ? pad2(body.gradeCode) : null;
  if (gradeCode) {
    const grade = getOne('SELECT gradeId FROM grades WHERE gradeCode = ?', [gradeCode]);
    conds.push('t.gradeId = ?');
    params.push(grade ? grade.gradeId : -1);
  }
  if (body.subjectCode) {
    const subject = getOne('SELECT subjectId FROM subjects WHERE subjectCode = ?', [String(body.subjectCode).toUpperCase()]);
    conds.push('t.subjectId = ?');
    params.push(subject ? subject.subjectId : -1);
  }
  const rows = getAll(`SELECT * FROM teachers t WHERE ${conds.join(' AND ')} ORDER BY t.lastName, t.firstName`, params);
  return envelope(res, 'Success', rows.map(teacherSummary));
});

function teacherSummary(t) {
  return {
    teacherId: t.teacherId,
    teacherIdExternal: t.teacherIdExternal,
    teacherName: `${t.lastName}, ${t.firstName}`,
    firstName: t.firstName,
    lastName: t.lastName,
    grade: t.gradeName ?? null,
    subject: t.subjectName ?? null,
  };
}

router.post('/teachers/top', (req, res) => {
  const body = req.body || {};
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(body.districtId) ?? 0, getInt(body.academicYearId) ?? 0];
  if (body.campusCategoryCode) {
    const cat = getOne('SELECT campusCategoryId FROM campus_categories WHERE categoryCode = ?', [String(body.campusCategoryCode).toUpperCase()]);
    if (cat) {
      const codes = getAll('SELECT campusCode FROM campuses WHERE campusCategoryId = ?', [cat.campusCategoryId]).map((r) => r.campusCode);
      conds.push(`campusCode IN (${codes.length ? codes.map(() => '?').join(',') : "''"})`);
      params.push(...codes);
    }
  }
  const grades = normalizeGradeFilter(body.gradeCode);
  if (grades && grades.length) {
    conds.push(`gradeCode IN (${grades.map(() => '?').join(',')})`);
    params.push(...grades);
  }
  const needsSubject = normalizeSubjectFilter(body.subjectCode || body.subject);
  if (needsSubject && needsSubject.length) {
    conds.push(`subjectCode IN (${needsSubject.map(() => '?').join(',')})`);
    params.push(...needsSubject);
  }
  const rows = getAll(
    `SELECT * FROM teacher_assessment_records WHERE ${conds.join(' AND ')} AND summativeScore IS NOT NULL ORDER BY summativeScore DESC`,
    params,
  );
  const top = Math.max(1, getInt(body.top) || 5);
  const subjectNameMap = new Map(getAll('SELECT subjectCode, subjectName FROM subjects').map((r) => [r.subjectCode, r.subjectName]));
  const data = rows.slice(0, top).map((r, i) => ({
    rank: i + 1,
    teacherIdExternal: r.teacherIdExternal,
    firstName: r.teacherFirstName,
    lastName: r.teacherLastName,
    teacherName: `${r.teacherFirstName} ${r.teacherLastName}`,
    subject: subjectNameMap.get(r.subjectCode) || r.subjectCode,
    summativeScore: r.summativeScore,
  }));
  return envelope(res, 'Success', data);
});

// ------------------------------------------------------------------ teacher assessments
router.get('/teacher-assessment/records', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0];
  if (req.query.gradeCode) { conds.push('gradeCode = ?'); params.push(pad2(req.query.gradeCode)); }
  if (req.query.subjectCode) { conds.push('subjectCode = ?'); params.push(String(req.query.subjectCode).toUpperCase()); }
  const min = asNumberOrNull(req.query.averageScoreMin);
  const max = asNumberOrNull(req.query.averageScoreMax);
  if (min !== null) { conds.push('averageScore >= ?'); params.push(min); }
  if (max !== null) { conds.push('averageScore <= ?'); params.push(max); }
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const totalRow = getOne(`SELECT COUNT(*) AS c FROM teacher_assessment_records ${whereSql}`, params);
  const offset = Math.max(0, getInt(req.query.offset) ?? 0);
  const limit = Math.max(1, getInt(req.query.limit) || 100);
  const rows = getAll(
    `SELECT * FROM teacher_assessment_records ${whereSql} ORDER BY teacherAssessmentRecordId LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const data = {
    records: rows.map((r) => ({
      teacherAssessmentRecordId: r.teacherAssessmentRecordId,
      teacherAssessmentUploadId: r.teacherAssessmentUploadId ?? 0,
      districtId: r.districtId,
      academicYearId: r.academicYearId,
      evaluationId: r.evaluationId,
      teacherIdExternal: r.teacherIdExternal,
      teacherFirstName: r.teacherFirstName,
      teacherLastName: r.teacherLastName,
      subjects: r.subjects,
      grade: r.grade,
      evaluationDate: r.evaluationDate,
      appraiserFirstName: r.appraiserFirstName,
      appraiserLastName: r.appraiserLastName,
      appraiserTitle: r.appraiserTitle,
      campusCode: r.campusCode,
      walkthrough1Score: r.walkthrough1Score,
      walkthrough2Score: r.walkthrough2Score,
      walkthrough3Score: r.walkthrough3Score,
      walkthrough4Score: r.walkthrough4Score,
      observation1Score: r.observation1Score,
      observation2Score: r.observation2Score,
      summativeScore: r.summativeScore,
      averageScore: r.averageScore,
      growth: r.growth,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdBy: r.createdBy,
      updatedBy: r.updatedBy,
    })),
    totalCount: totalRow.c,
    offset,
    limit,
    growthQuarterCode: 'Q1',
  };
  return envelope(res, 'Success', data);
});

// ------------------------------------------------------------------ T-TESS 16-dimension assessments

/** T-TESS dimension columns in domain order (1.1–1.4, 2.1–2.5, 3.1–3.3, 4.1–4.4). */
const TTESS_RATING_COLUMNS = [
  'rating1_1', 'rating1_2', 'rating1_3', 'rating1_4',
  'rating2_1', 'rating2_2', 'rating2_3', 'rating2_4', 'rating2_5',
  'rating3_1', 'rating3_2', 'rating3_3',
  'rating4_1', 'rating4_2', 'rating4_3', 'rating4_4',
];

/** T-TESS score bands — same thresholds as the T-TESS page legend. */
function ttessBand(score) {
  if (score <= 63) return 'Needs Improvement';
  if (score <= 74) return 'Progressing';
  return 'Proficient';
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * POST /api/teacher-assessment/ttess — save a full 16-dimension T-TESS assessment.
 * Stores the complete rubric in ttess_assessments and mirrors one scored row into
 * teacher_assessment_records so the existing T-TESS page (table, overview cards,
 * charts, exports) picks it up with no behavior change.
 */
router.post('/teacher-assessment/ttess', (req, res) => {
  const body = req.body || {};
  const districtId = getInt(body.districtId);
  const academicYearId = getInt(body.academicYearId);
  const teacherId = getInt(body.teacherId);
  if (districtId == null || academicYearId == null || teacherId == null) {
    return envelope(res, 'districtId, academicYearId and teacherId are required.', null, 400);
  }

  const teacher = getOne('SELECT * FROM teachers WHERE teacherId = ?', [teacherId]);
  if (!teacher) {
    return envelope(res, 'Teacher not found.', null, 404);
  }
  const campus = teacher.campusId != null
    ? getOne('SELECT * FROM campuses WHERE campusId = ?', [teacher.campusId])
    : null;

  // ---- Load this district's active rubric (seeded on startup in db.js) ----
  const rubricQuestions = getAll(
    `SELECT q.*, d.domainNumber FROM ttess_questions q
     JOIN ttess_domains d ON d.ttessDomainId = q.ttessDomainId
     WHERE q.districtId = ? AND q.isActive = 1 AND d.isActive = 1
     ORDER BY d.domainNumber, q.sortOrder, q.ttessQuestionId`,
    [districtId],
  );
  const rubricOptions = getAll(
    'SELECT * FROM ttess_options WHERE districtId = ? AND isActive = 1 ORDER BY sortOrder, ttessOptionId',
    [districtId],
  );
  const maxPoints = rubricOptions.length ? Math.max(...rubricOptions.map((o) => Number(o.pointValue))) : 5;
  const minPoints = rubricOptions.length ? Math.min(...rubricOptions.map((o) => Number(o.pointValue))) : 1;

  // Collect the rating for every ACTIVE rubric question. New payloads send
  // `ratings` (array of {questionId, points}); legacy payloads send the fixed
  // rating1_1…rating4_4 columns, matched to questions by their code.
  const pointsByQuestionId = new Map();
  if (body.ratings && typeof body.ratings === 'object') {
    const list = Array.isArray(body.ratings)
      ? body.ratings
      : Object.entries(body.ratings).map(([k, v]) => ({ questionId: k, points: v }));
    for (const r of list) {
      const qid = getInt(r.questionId);
      if (qid != null) pointsByQuestionId.set(qid, r.points == null ? null : Number(r.points));
    }
  } else {
    for (const q of rubricQuestions) {
      const match = /^([1-9])\.(\d+)$/.exec(String(q.questionCode || '').trim());
      const col = match ? `rating${match[1]}_${match[2]}` : null;
      if (col && body[col] !== undefined) pointsByQuestionId.set(q.ttessQuestionId, Number(body[col]));
    }
  }

  // Validate: every active question rated with a point value on the scale.
  const ratings = {};
  for (const q of rubricQuestions) {
    const v = pointsByQuestionId.get(q.ttessQuestionId);
    if (v == null || !Number.isFinite(v) || Math.round(v) !== v || v < minPoints || v > maxPoints) {
      return envelope(
        res,
        `All ${rubricQuestions.length} T-TESS dimensions must be rated from ${minPoints} to ${maxPoints} (question ${q.questionCode} is invalid).`,
        null,
        400,
      );
    }
    ratings[q.ttessQuestionId] = Math.round(v);
  }

  // Overall score = (average of selected points ÷ maximum points) × 100, 1 decimal.
  // The maximum comes from the district's active options, so the formula survives
  // rubric edits while the standard rubric keeps the exact same 0–100 result.
  const ratingValues = rubricQuestions.map((q) => ratings[q.ttessQuestionId]);
  const avgRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
  const averageScore = round1((avgRating / maxPoints) * 100);
  const band = ttessBand(averageScore);

  // Legacy fixed columns (rating1_1…rating4_4) are still filled when a question's
  // code matches, so existing reads keep working; everything else lives in the
  // ratingsJson snapshot written right after the insert.
  for (const q of rubricQuestions) {
    const match = /^([1-9])\.(\d+)$/.exec(String(q.questionCode || '').trim());
    const col = match ? `rating${match[1]}_${match[2]}` : null;
    if (col && TTESS_RATING_COLUMNS.includes(col)) {
      ratings[col] = ratings[q.ttessQuestionId] <= 5 ? ratings[q.ttessQuestionId] : null;
    }
  }
  for (const col of TTESS_RATING_COLUMNS) {
    if (ratings[col] === undefined) ratings[col] = null;
  }

  // Growth = this score − the teacher's previous scored assessment (same district + year).
  const previous = getOne(
    `SELECT averageScore FROM teacher_assessment_records
     WHERE districtId = ? AND academicYearId = ? AND teacherIdExternal IS ? AND averageScore IS NOT NULL
     ORDER BY teacherAssessmentRecordId DESC LIMIT 1`,
    [districtId, academicYearId, teacher.teacherIdExternal ?? null],
  );
  const growth = previous && previous.averageScore != null ? round1(averageScore - Number(previous.averageScore)) : null;

  const ts = nowIso();
  const createdBy = body.createdBy || 'system';
  const ratingCols = TTESS_RATING_COLUMNS.join(', ');
  const ratingPlaceholders = TTESS_RATING_COLUMNS.map(() => '?').join(', ');
  const ttessAssessmentId = insert(
    `INSERT INTO ttess_assessments (
      districtId, academicYearId, campusId, campusCode, teacherId, teacherIdExternal,
      teacherFirstName, teacherLastName, observationDate, observationType, evaluatorName,
      ${ratingCols}, commentDomain1, commentDomain2, commentDomain3, commentDomain4,
      overallComment, averageScore, band, growth, createdAt, createdBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ratingPlaceholders}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      districtId,
      academicYearId,
      campus?.campusId ?? null,
      campus?.campusCode ?? null,
      teacherId,
      teacher.teacherIdExternal ?? null,
      teacher.firstName ?? null,
      teacher.lastName ?? null,
      body.observationDate || null,
      body.observationType || null,
      body.evaluatorName || null,
      ...TTESS_RATING_COLUMNS.map((c) => ratings[c]),
      body.commentDomain1 || null,
      body.commentDomain2 || null,
      body.commentDomain3 || null,
      body.commentDomain4 || null,
      body.overallComment || null,
      averageScore,
      band,
      growth,
      ts,
      createdBy,
    ],
  );

  // History protection: snapshot the exact questionId -> points used at save time.
  // Editing question text, options or order later can never reinterpret this row.
  run(
    'UPDATE ttess_assessments SET ratingsJson = ? WHERE ttessAssessmentId = ?',
    [
      JSON.stringify({
        maxPoints,
        rubric: rubricQuestions.map((q) => ({
          questionId: q.ttessQuestionId,
          code: q.questionCode,
          points: ratings[q.ttessQuestionId],
        })),
      }),
      ttessAssessmentId,
    ],
  );

  // Mirror one scored row into teacher_assessment_records (the table/charts data source).
  const grade = teacher.gradeId != null ? getOne('SELECT * FROM grades WHERE gradeId = ?', [teacher.gradeId]) : null;
  const subject = teacher.subjectId != null ? getOne('SELECT * FROM subjects WHERE subjectId = ?', [teacher.subjectId]) : null;
  const evaluator = String(body.evaluatorName || '').trim();
  const evaluatorSpace = evaluator.indexOf(' ');
  const appraiserFirstName = evaluatorSpace > 0 ? evaluator.slice(0, evaluatorSpace) : evaluator || null;
  const appraiserLastName = evaluatorSpace > 0 ? evaluator.slice(evaluatorSpace + 1).trim() || null : null;
  const mirroredRecordId = insert(
    `INSERT INTO teacher_assessment_records (
      districtId, academicYearId, evaluationId, teacherIdExternal, teacherFirstName, teacherLastName,
      subjects, grade, evaluationDate, appraiserFirstName, appraiserLastName, appraiserTitle, campusCode,
      gradeCode, subjectCode, summativeScore, averageScore, growth, createdAt, createdBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      districtId,
      academicYearId,
      `TTESS-${ttessAssessmentId}`,
      teacher.teacherIdExternal ?? null,
      teacher.firstName ?? null,
      teacher.lastName ?? null,
      subject?.subjectName ?? null,
      grade?.gradeName ?? null,
      body.observationDate || null,
      appraiserFirstName,
      appraiserLastName,
      body.observationType || null,
      campus?.campusCode ?? null,
      grade?.gradeCode ?? null,
      subject?.subjectCode ?? null,
      averageScore,
      averageScore,
      growth,
      ts,
      createdBy,
    ],
  );

  return envelope(res, 'Assessment saved', {
    ttessAssessmentId,
    teacherAssessmentRecordId: mirroredRecordId,
    teacherId,
    teacherIdExternal: teacher.teacherIdExternal ?? null,
    teacherName: `${teacher.lastName ?? ''}, ${teacher.firstName ?? ''}`.trim(),
    campusCode: campus?.campusCode ?? null,
    observationDate: body.observationDate || null,
    observationType: body.observationType || null,
    evaluatorName: body.evaluatorName || null,
    averageScore,
    band,
    growth,
  });
});

/**
 * GET /api/teacher-assessment/ttess/teacher-latest — the teacher's most recent scored
 * assessment (any source) for the "New Assessment" summary card.
 */
router.get('/teacher-assessment/ttess/teacher-latest', (req, res) => {
  const districtId = getInt(req.query.districtId) ?? 0;
  const teacherIdExternal = String(req.query.teacherIdExternal ?? '').trim();
  if (!teacherIdExternal) {
    return envelope(res, 'Success', null);
  }
  const row = getOne(
    `SELECT averageScore, evaluationDate, appraiserTitle FROM teacher_assessment_records
     WHERE districtId = ? AND teacherIdExternal = ? AND averageScore IS NOT NULL
     ORDER BY teacherAssessmentRecordId DESC LIMIT 1`,
    [districtId, teacherIdExternal],
  );
  if (!row) {
    return envelope(res, 'Success', null);
  }
  return envelope(res, 'Success', {
    averageScore: row.averageScore,
    evaluationDate: row.evaluationDate,
    observationType: row.appraiserTitle,
    band: ttessBand(Number(row.averageScore)),
  });
});

/**
 * GET /api/teacher-assessment/ttess/stats — aggregated T-TESS statistics for the
 * dashboard "T-TESS Assessment" card + popup. Built from the same stored records the
 * T-TESS page uses (teacher_assessment_records); no score is recalculated — the stored
 * averageScore / growth values are aggregated. Scoped by optional districtId,
 * academicYearId and campusCode (omit for "All Districts").
 *
 * Aggregation rule (matches the T-TESS page semantics): a teacher's stats use their
 * LATEST record; first-time teachers have growth = null and are excluded from the
 * average growth (not counted as 0).
 */
router.get('/teacher-assessment/ttess/stats', (req, res) => {
  const districtId = getInt(req.query.districtId);
  const academicYearId = getInt(req.query.academicYearId);
  const campusCode = String(req.query.campusCode || '').trim().toUpperCase() || null;

  const conds = [];
  const params = [];
  if (districtId != null) { conds.push('districtId = ?'); params.push(districtId); }
  if (academicYearId != null) { conds.push('academicYearId = ?'); params.push(academicYearId); }
  if (campusCode) { conds.push('campusCode = ?'); params.push(campusCode); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = getAll(
    `SELECT * FROM teacher_assessment_records ${where} ORDER BY teacherAssessmentRecordId`,
    params,
  );
  const campusNameByCode = new Map(
    getAll('SELECT campusCode, campusName FROM campuses').map((c) => [
      (c.campusCode || '').trim().toUpperCase(),
      c.campusName,
    ]),
  );
  const campusLabel = (code) => {
    const key = (code || '').trim().toUpperCase();
    return campusNameByCode.get(key) || key || 'Unassigned';
  };
  const bandOf = (score) => (score <= 63 ? 'Needs Improvement' : score <= 74 ? 'Progressing' : 'Proficient');
  const teacherKey = (r) =>
    String(r.teacherIdExternal || '').trim() ||
    `name:${(r.teacherFirstName || '').trim().toLowerCase()} ${(r.teacherLastName || '').trim().toLowerCase()}|${(r.campusCode || '').trim().toUpperCase()}`;

  // Latest record per teacher (rows are already in recordId order, so the map ends up with the latest).
  const latestByTeacher = new Map();
  for (const r of rows) {
    latestByTeacher.set(teacherKey(r), r);
  }
  const latest = [...latestByTeacher.values()];
  const num = (v) => (v == null ? null : Number(v));
  const scored = latest.filter((r) => Number.isFinite(num(r.averageScore)));
  const meanOrNull = (values) => {
    const finite = values.filter((v) => Number.isFinite(v));
    return finite.length ? Math.round((finite.reduce((a, b) => a + b, 0) / finite.length) * 10) / 10 : null;
  };
  const latestScores = scored.map((r) => num(r.averageScore));
  const latestGrowths = latest.map((r) => num(r.growth)).filter((v) => Number.isFinite(v));

  const averageScore = meanOrNull(latestScores);
  const averageGrowth = meanOrNull(latestGrowths);
  const bands = { needsImprovement: 0, progressing: 0, proficient: 0 };
  for (const s of latestScores) {
    if (s <= 63) bands.needsImprovement += 1;
    else if (s <= 74) bands.progressing += 1;
    else bands.proficient += 1;
  }
  const proficientPct = latestScores.length
    ? Math.round((bands.proficient / latestScores.length) * 1000) / 10
    : null;

  const groupBy = (list, keyOfFn) => {
    const groups = new Map();
    for (const r of list) {
      const s = num(r.averageScore);
      if (!Number.isFinite(s)) continue;
      const key = keyOfFn(r) || 'Unassigned';
      const bucket = groups.get(key) || [];
      bucket.push(s);
      groups.set(key, bucket);
    }
    return [...groups.entries()]
      .map(([label, scores]) => ({ label, avg: meanOrNull(scores), count: scores.length }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' }));
  };

  const recent = [...rows].slice(-10).reverse().map((r) => {
    const score = Number.isFinite(num(r.averageScore)) ? num(r.averageScore) : null;
    return {
      teacherName: `${(r.teacherFirstName || '').trim()} ${(r.teacherLastName || '').trim()}`.trim() || '—',
      campus: campusLabel(r.campusCode),
      grade: (r.grade || '').trim() || '—',
      subject: (r.subjects || '').trim() || '—',
      score,
      band: score == null ? null : bandOf(score),
      growth: Number.isFinite(num(r.growth)) ? num(r.growth) : null,
      date: r.evaluationDate || null,
    };
  });

  return envelope(res, 'Success', {
    districtId: districtId ?? null,
    academicYearId: academicYearId ?? null,
    campusCode: campusCode || null,
    assessmentsCount: rows.length,
    teachersAssessed: latest.length,
    scoredTeachers: scored.length,
    averageScore,
    averageGrowth,
    proficientPct,
    bands,
    byGrade: groupBy(latest, (r) => (r.grade || '').trim() || 'Unassigned'),
    byCampus: groupBy(latest, (r) => campusLabel(r.campusCode)),
    recent,
  });
});

// ------------------------------------------------------------------ mobility
router.post('/student-mobility/quarter-comparison', (req, res) => {
  const body = req.body || {};
  const districtId = getInt(body.districtId) ?? 0;
  const academicYearId = getInt(body.academicYearId) ?? 0;
  const quarterCode = upperOrNull(body.quarterCode) || 'BOY';
  let row = null;
  if (body.campusCode) {
    row = getOne(
      'SELECT * FROM student_mobility WHERE districtId = ? AND academicYearId = ? AND quarterCode = ? AND campusCode = ?',
      [districtId, academicYearId, quarterCode, String(body.campusCode).toUpperCase()],
    );
  }
  if (!row) {
    row = getOne(
      'SELECT * FROM student_mobility WHERE districtId = ? AND academicYearId = ? AND quarterCode = ? AND campusCode IS NULL',
      [districtId, academicYearId, quarterCode],
    );
  }
  if (!row) {
    row = getOne(
      'SELECT * FROM student_mobility WHERE districtId = ? AND academicYearId = ? ORDER BY id',
      [districtId, academicYearId],
    );
  }
  if (!row) {
    return envelope(res, 'Success', {
      currentQuarterCode: quarterCode,
      previousQuarterCode: null,
      comparisonAvailable: false,
      totalStudents: 0,
      previousTotalStudents: null,
      incomingStudents: null,
      outgoingStudents: null,
      retainedStudents: null,
      netChange: null,
    });
  }
  return envelope(res, 'Success', {
    districtId: row.districtId,
    academicYearId: row.academicYearId,
    campusCode: row.campusCode,
    currentQuarterCode: quarterCode,
    previousQuarterCode: row.previousQuarterCode,
    comparisonAvailable: true,
    totalStudents: row.totalStudents,
    previousTotalStudents: row.previousTotalStudents,
    incomingStudents: row.incomingStudents,
    outgoingStudents: row.outgoingStudents,
    retainedStudents: row.retainedStudents,
    netChange: row.netChange,
  });
});

// ------------------------------------------------------------------ student growth records (paged)
router.get('/student-growth-records', (req, res) => {
  const conds = ['districtId = ?', 'academicYearId = ?'];
  const params = [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0];
  if (req.query.quarterCode) { conds.push('quarterCode = ?'); params.push(String(req.query.quarterCode).toUpperCase()); }
  if (req.query.campusCode) { conds.push('campusCode = ?'); params.push(String(req.query.campusCode).toUpperCase()); }
  if (req.query.gradeCode) { conds.push('gradeCode = ?'); params.push(pad2(req.query.gradeCode)); }
  if (req.query.subjectCode) { conds.push('subjectCode = ?'); params.push(String(req.query.subjectCode).toUpperCase()); }
  if (req.query.teacherId) { conds.push('teacherIdExternal = ?'); params.push(String(req.query.teacherId)); }
  const specEdu = asBoolOrNull(req.query.specialEducation);
  if (specEdu !== null) { conds.push('specialEducation = ?'); params.push(specEdu ? 1 : 0); }
  const econ = asBoolOrNull(req.query.economicDisadvantage);
  if (econ !== null) { conds.push('economicDisadvantage = ?'); params.push(econ ? 1 : 0); }
  if (req.query.emergentBilingual) { conds.push('emergentBilingual = ?'); params.push(String(req.query.emergentBilingual) === 'Y' ? 1 : 0); }
  if (req.query.testLanguage) { conds.push('testLang = ?'); params.push(String(req.query.testLanguage)); }
  if (req.query.ethnicity) { conds.push('ethnicity = ?'); params.push(String(req.query.ethnicity)); }
  const whereSql = `WHERE ${conds.join(' AND ')}`;
  const totalRow = getOne(`SELECT COUNT(*) AS c FROM student_growth_records ${whereSql}`, params);
  const offset = Math.max(0, getInt(req.query.offset) ?? 0);
  const limit = Math.max(1, getInt(req.query.limit) || 10);
  const rows = getAll(
    `SELECT * FROM student_growth_records ${whereSql} ORDER BY studentGrowthRecordId LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const quarterSequence = getAll(
    'SELECT quarterCode FROM district_quarters WHERE districtId = ? AND academicYearId = ? ORDER BY sortOrder',
    [getInt(req.query.districtId) ?? 0, getInt(req.query.academicYearId) ?? 0],
  ).map((r) => r.quarterCode);
  const data = {
    records: rows.map(sgrRecord),
    totalCount: totalRow.c,
    offset,
    limit,
    districtId: getInt(req.query.districtId) ?? 0,
    academicYearId: getInt(req.query.academicYearId) ?? 0,
    quarterCode: String(req.query.quarterCode || ''),
    quarterSequence: quarterSequence.length ? quarterSequence : ['BOY', 'PA1', 'MOY', 'EOY'],
  };
  return envelope(res, 'Success', data);
});

function sgrRecord(r) {
  return {
    studentGrowthRecordId: r.studentGrowthRecordId,
    growthSheetUploadId: r.growthSheetUploadId ?? 0,
    districtId: r.districtId,
    academicYearId: r.academicYearId,
    quarterCode: r.quarterCode,
    localId: r.localId,
    studentName: r.studentName,
    campusCode: r.campusCode,
    gradeCode: r.gradeCode,
    subjectCode: r.subjectCode,
    teacherId: r.teacherIdExternal,
    teacherName: r.teacherName,
    testLang: r.testLang,
    specialEducation: r.specialEducation ?? null,
    economicDisadvantage: r.economicDisadvantage ?? null,
    staar: r.staar,
    staarPerLevel: r.staarPerLevel,
    quarterScore: r.quarterScore,
    quarterPerLevel: r.quarterPerLevel,
    cs: r.cs,
    delta: r.delta,
    growth: r.growth,
    app: r.app,
    meets: r.meets,
    masters: r.masters,
    totalGrowthForQuarter: r.totalGrowthForQuarter,
    hb1416: r.hb1416,
    hb1416Delta: r.hb1416Delta,
    quarterScoreProgression: quarterProgression(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
  };
}

function quarterProgression(r) {
  const seq = ['BOY', 'PA1', 'PA2', 'MOY', 'PA3', 'PA4', 'PA5', 'EOY'];
  const idx = seq.indexOf(String(r.quarterCode).toUpperCase());
  const out = [];
  if (idx > 0) {
    const earlier = seq[idx - 1];
    const prev = getOne(
      'SELECT quarterScore FROM student_growth_records WHERE localId = ? AND subjectCode = ? AND quarterCode = ? AND academicYearId = ?',
      [r.localId, r.subjectCode, earlier, r.academicYearId],
    );
    if (prev && prev.quarterScore !== null) {
      out.push({
        earlierQuarterCode: earlier,
        earlierQuarterScore: prev.quarterScore,
        laterQuarterCode: r.quarterCode,
        laterQuarterScore: r.quarterScore,
      });
    }
  }
  return out;
}

router.post('/student-growth-records/by-teacher', (req, res) => {
  const body = { ...req.body };
  body.grade = normalizeGradeFilter(body.gradeCode) || normalizeGradeFilter(body.grade);
  body.subject = normalizeSubjectFilter(body.subjectCode) || normalizeSubjectFilter(body.subject);
  const teacher = body.teacherId ? getOne('SELECT * FROM teachers WHERE teacherId = ?', [Number(body.teacherId)]) : null;
  const filter = [];
  if (teacher) {
    filter.push({ sql: 'teacherIdExternal = ?', params: [teacher.teacherIdExternal] });
  }
  const rows = queryStudentGrowth(body, filter);
  const data = rows.map(sgrRecord);
  return envelope(res, 'Success', { records: data });
});

module.exports = router;
