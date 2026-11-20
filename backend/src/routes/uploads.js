'use strict';
/**
 * Upload endpoints for all 7 upload flows — multipart with FormData field `file`
 * and metadata as query params, matching simplify-uploads.service.ts exactly.
 * CSV and Excel files are parsed; parsed rows are inserted when the sheet type
 * maps to real data tables (growth sheet, campus attendance, individual attendance,
 * teacher assessment, CCMR, student standards).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getOne, getAll, insert, run, nowIso, DATA_DIR } = require('../db');
const { upperOrNull, pad2, asBoolOrNull, asNumberOrNull, round } = require('../util');

const router = express.Router();

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`;
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

function q(req, name) {
  return req.query[name] === undefined ? req.body?.[name] : req.query[name];
}

// ------------------------------------------------------------- parse helpers
function parseWorkbook(filePath) {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: false });
    return { rows, sheets: wb.SheetNames };
  } catch {
    return { rows: [], sheets: [] };
  }
}

function pick(row, names) {
  for (const n of names) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === n.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        const v = row[key];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return null;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------- upload types
const TYPES = {
  'growth-sheet': { idField: 'growthSheetUploadId', listFilters: ['districtId', 'academicYearId', 'quarterCode'] },
  'rawscores-uploads': { idField: 'rawscoresUploadId', listFilters: ['districtId', 'academicYearId'], jsonCreate: true, label: 'Rawscores' },
  'campus-attendance': { idField: 'campusAttendanceUploadId', listFilters: ['districtId', 'academicYearId'] },
  'teacher-assessment': { idField: 'teacherAssessmentUploadId', listFilters: ['districtId', 'academicYearId'] },
  'student-standards': { idField: 'studentStandardsUploadId', listFilters: ['districtId', 'academicYearId', 'quarterCode'] },
  'individual-attendance': { idField: 'individualAttendanceUploadId', listFilters: ['districtId', 'academicYearId', 'quarterCode'] },
  ccmr: { idField: 'ccmrSheetUploadId', listFilters: ['districtId', 'academicYearId'] },
};

function uploadRow(u) {
  const type = u.uploadType;
  const base = {
    fileName: u.fileName,
    uploadedAt: u.uploadedAt,
    uploadedBy: u.uploadedBy,
    recordCount: u.recordCount,
    status: u.status,
    errorMessage: u.errorMessage,
  };
  if (type === 'growth-sheet') {
    return { growthSheetUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId, quarterCode: u.quarterCode, ...base,
      skippedCount: u.skippedCount, updatedCount: u.updatedCount };
  }
  if (type === 'rawscores-uploads') {
    return { rawscoresUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId, ...base,
      skippedRowCount: u.skippedRowCount, updatedRowCount: u.updatedRowCount };
  }
  if (type === 'campus-attendance') {
    return { campusAttendanceUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId,
      districtGoal: u.districtGoal, estimatedDollarsPerStudent: u.estimatedDollarsPerStudent, ...base,
      sheetMessages: u.sheetMessages ? JSON.parse(u.sheetMessages) : undefined };
  }
  if (type === 'teacher-assessment') {
    return { teacherAssessmentUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId,
      scoreMultiplier: u.scoreMultiplier, ...base, skippedCount: u.skippedCount, insertedCount: u.insertedCount, updatedCount: u.updatedCount };
  }
  if (type === 'student-standards') {
    return { studentStandardsUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId, quarterCode: u.quarterCode, ...base,
      skippedCount: u.skippedCount, insertedCount: u.insertedCount, updatedCount: u.updatedCount };
  }
  if (type === 'individual-attendance') {
    return { individualAttendanceUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId, quarterCode: u.quarterCode, ...base };
  }
  return { ccmrSheetUploadId: u.uploadId, districtId: u.districtId, academicYearId: u.academicYearId, ...base,
    skippedCount: u.skippedCount, insertedCount: u.insertedCount, updatedCount: u.updatedCount };
}

function createUploadRecord(type, req) {
  const districtId = asNumberOrNull(q(req, 'districtId')) ?? 0;
  const academicYearId = asNumberOrNull(q(req, 'academicYearId'));
  const quarterCode = upperOrNull(q(req, 'quarterCode'));
  const uploadedBy = q(req, 'uploadedBy') || req.user?.email || 'local-api';
  const file = req.file;
  const fileName = file ? file.originalname : q(req, 'fileName') || 'manual.json';
  const id = insert(
    `INSERT INTO uploads (uploadType, districtId, academicYearId, quarterCode, fileName, storedFileName, uploadedAt, uploadedBy, status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [type, districtId, academicYearId, quarterCode, fileName, file ? file.filename : null, nowIso(), uploadedBy, 'Processing'],
  );
  return id;
}

function finalizeUpload(type, id, fields) {
  const sets = [];
  const vals = [];
  const fieldNames = { recordCount: 'recordCount', skippedCount: 'skippedCount', insertedCount: 'insertedCount',
    updatedCount: 'updatedCount', skippedRowCount: 'skippedRowCount', updatedRowCount: 'updatedRowCount',
    districtGoal: 'districtGoal', estimatedDollarsPerStudent: 'estimatedDollarsPerStudent', scoreMultiplier: 'scoreMultiplier',
    status: 'status', errorMessage: 'errorMessage', sheetMessages: 'sheetMessages' };
  for (const [k, col] of Object.entries(fieldNames)) {
    if (fields[k] !== undefined) { sets.push(`${col} = ?`); vals.push(fields[k]); }
  }
  if (!sets.length) return;
  vals.push(id);
  run(`UPDATE uploads SET ${sets.join(', ')} WHERE uploadId = ?`, vals);
}

function insertParsedRows(type, rows, req, numericExtras = {}) {
  // returns [inserted, skipped, updated]
  if (!rows.length) return [0, 0, 0];
  const districtId = asNumberOrNull(q(req, 'districtId')) ?? 0;
  const academicYearId = asNumberOrNull(q(req, 'academicYearId'));
  const quarterCode = upperOrNull(q(req, 'quarterCode'));
  let inserted = 0;
  let skipped = 0;
  const campusNameByCode = new Map(getAll('SELECT campusCode, campusName FROM campuses').map((r) => [r.campusCode, r.campusName]));
  const campusIdByCode = new Map(getAll('SELECT campusCode, campusId FROM campuses').map((r) => [r.campusCode, r.campusId]));
  const gradeNames = new Set(getAll('SELECT gradeCode FROM grades').map((r) => r.gradeCode));

  for (const row of rows) {
    try {
      if (type === 'campus-attendance') {
        const campusCode = upperOrNull(pick(row, ['campusCode', 'campus', 'locationCode', 'location']));
        if (!campusCode) { skipped++; continue; }
        const date = pick(row, ['attendanceDate', 'date', 'reportDate']);
        const dayRaw = pick(row, ['dayOfWeek', 'day']) || weekdayOf(date);
        const ada = toNumber(pick(row, ['campusAdaPct', 'ada', 'campusAda', 'adaPct', 'averageAdaPct']));
        if (ada === null) { skipped++; continue; }
        const enrollment = toNumber(pick(row, ['enrollment', 'students', 'totalStudents'])) ?? 0;
        const absents = toNumber(pick(row, ['studentsAbsent', 'studentAbsents', 'absents', 'absentCount', 'numberStudentAbsent'])) ?? 0;
        const missed = toNumber(pick(row, ['estimatedMissed', 'estimatedMissedFinance', 'missedFinance'])) ?? 0;
        const goal = toNumber(pick(row, ['absGoal', 'absenceGoal', 'goal'])) ?? numericExtras.districtGoal ?? 95;
        insert(`
          INSERT INTO campus_attendance_daily (
            districtId, academicYearId, campusCode, campusName, attendanceDate, dayOfWeek,
            campusAdaPct, campusAda, enrollment, studentsAbsent, absentCount, estimatedMissed, estimatedMissedFinance, absGoal, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, academicYearId, campusCode, campusNameByCode.get(campusCode) || campusCode, normalizeDate(date),
          dayRaw, round(ada, 2), round(ada / 100 * enrollment, 0), enrollment, absents, absents, missed, missed, goal, nowIso()]);
        inserted++;
      } else if (type === 'individual-attendance') {
        const localId = pick(row, ['localId', 'studentId', 'id']);
        const firstName = pick(row, ['firstName', 'first']);
        const lastName = pick(row, ['lastName', 'last']);
        const membership = toNumber(pick(row, ['totalDaysMembership', 'daysMembership', 'membership']));
        const absent = toNumber(pick(row, ['totalDaysAbsent', 'daysAbsent', 'absent'])) ?? 0;
        let pia = toNumber(pick(row, ['totalPia', 'pia']));
        if (pia === null && membership) pia = (membership - absent) / membership * 100;
        if (pia === null) { skipped++; continue; }
        let campusCode = upperOrNull(pick(row, ['campusCode', 'campus', 'locationCode']));
        if (!campusCode) campusCode = campusForStudent(localId);
        insert(`
          INSERT INTO individual_attendance_records (
            districtId, academicYearId, quarterCode, campusCode, localId, firstName, lastName,
            totalDaysMembership, totalDaysAbsent, totalPia, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, academicYearId, quarterCode, campusCode, localId, firstName, lastName, membership, absent, round(pia, 1), nowIso()]);
        inserted++;
      } else if (type === 'ccmr') {
        const localId = pick(row, ['studentId', 'localId', 'id']);
        const first = pick(row, ['firstName', 'first']);
        const last = pick(row, ['lastName', 'last']);
        const credit = toNumber(pick(row, ['credit', 'credits', 'totalCredits'])) ?? 0;
        const month = pick(row, ['calendarMonth', 'month']) || 'April';
        let academyCode = upperOrNull(pick(row, ['academyCode', 'school', 'academy']));
        if (!academyCode) { skipped++; continue; }
        insert(`
          INSERT INTO ccmr_records (
            districtId, academicYearId, calendarMonth, academyCode, school, studentId, firstName, lastName,
            credit, campus, grade, planA, planB, ccmrMet, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, academicYearId, month, academyCode, academyCode, localId, first, last, credit,
          `${academyCode} Campus`, pick(row, ['grade', 'gradeCode']), pick(row, ['planA', 'plan_a']), pick(row, ['planB', 'plan_b']),
          credit >= 22 ? 1 : 0, nowIso()]);
        inserted++;
      } else if (type === 'teacher-assessment') {
        const evalId = pick(row, ['evaluationId', 'evaluation', 'id']);
        const first = pick(row, ['teacherFirstName', 'teacherFirst', 'firstName', 'first']);
        const last = pick(row, ['teacherLastName', 'teacherLast', 'lastName', 'last']);
        const summ = toNumber(pick(row, ['summativeScore', 'summative']));
        const avg = toNumber(pick(row, ['averageScore', 'average']));
        const campusCode = upperOrNull(pick(row, ['campusCode', 'campus']));
        if (evalId === null) { skipped++; continue; }
        insert(`
          INSERT INTO teacher_assessment_records (
            districtId, academicYearId, evaluationId, teacherIdExternal, teacherFirstName, teacherLastName,
            subjects, grade, evaluationDate, appraiserFirstName, appraiserLastName, appraiserTitle, campusCode,
            gradeCode, subjectCode, walkthrough1Score, walkthrough2Score, walkthrough3Score, walkthrough4Score,
            observation1Score, observation2Score, summativeScore, averageScore, growth, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, academicYearId, evalId, pick(row, ['teacherIdExternal', 'teacherId']),
          first, last, pick(row, ['subjects', 'subject']), pick(row, ['grade', 'gradeCode']),
          normalizeDate(pick(row, ['evaluationDate', 'date'])), pick(row, ['appraiserFirstName']), pick(row, ['appraiserLastName']),
          pick(row, ['appraiserTitle']), campusCode, pad2(pick(row, ['gradeCode', 'grade'])), upperOrNull(pick(row, ['subjectCode', 'subject'])),
          toNumber(pick(row, ['walkthrough1Score', 'walkthrough1'])), toNumber(pick(row, ['walkthrough2Score', 'walkthrough2'])),
          toNumber(pick(row, ['walkthrough3Score', 'walkthrough3'])), toNumber(pick(row, ['walkthrough4Score', 'walkthrough4'])),
          toNumber(pick(row, ['observation1Score', 'observation1'])), toNumber(pick(row, ['observation2Score', 'observation2'])),
          summ, avg, toNumber(pick(row, ['growth'])), nowIso()]);
        inserted++;
      } else if (type === 'growth-sheet' || type === 'rawscores-uploads') {
        const localId = pick(row, ['localId', 'studentId', 'id']);
        const studentName = pick(row, ['studentName', 'name', 'full name']);
        const campusCode = upperOrNull(pick(row, ['campusCode', 'campus']));
        const gradeCode = pad2(pick(row, ['grade', 'gradeCode']));
        const subjectCode = upperOrNull(pick(row, ['subject', 'subjectCode']));
        const quarter = upperOrNull(pick(row, ['quarter', 'quarterCode'])) || quarterCode;
        if (localId === null && studentName === null) { skipped++; continue; }
        // upsert semantics: update existing record for same student/campus/grade/subject/quarter
        const existing = getOne(
          'SELECT studentGrowthRecordId FROM student_growth_records WHERE localId = ? AND quarterCode = ? AND subjectCode = ? AND academicYearId = ?',
          [localId, quarter, subjectCode, academicYearId],
        );
        const payload = [
          districtId, academicYearId, quarter, localId, studentName, campusCode, gradeCode, subjectCode,
          pick(row, ['teacherId', 'teacherIdExternal']), pick(row, ['teacherName', 'teacher']), pick(row, ['testLang', 'testLanguage', 'language']),
          toBoolInt(pick(row, ['specialEducation', 'special ed', 'sped'])),
          toBoolInt(pick(row, ['economicDisadvantage', 'economically disadvantaged', 'eco dis'])),
          toBoolInt(pick(row, ['emergentBilingual', 'eb'])),
          pick(row, ['ethnicity', 'race']),
          toNumber(pick(row, ['staar'])), toNumber(pick(row, ['staarPerLevel'])),
          toNumber(pick(row, ['quarterScore', 'score'])), toNumber(pick(row, ['quarterPerLevel'])),
          toNumber(pick(row, ['cs', 'componentScore'])), toNumber(pick(row, ['delta'])), toNumber(pick(row, ['growth'])),
          toNumber(pick(row, ['app'])), toNumber(pick(row, ['meets', 'meet'])), toNumber(pick(row, ['masters', 'master'])),
          toNumber(pick(row, ['totalGrowthForQuarter'])), toNumber(pick(row, ['hb1416'])), toNumber(pick(row, ['hb1416Delta'])),
        ];
        if (existing) {
          run(`UPDATE student_growth_records SET campusCode = COALESCE(?, campusCode), gradeCode = COALESCE(?, gradeCode),
              teacherIdExternal = COALESCE(?, teacherIdExternal), teacherName = COALESCE(?, teacherName), staar = ?, staarPerLevel = ?,
              quarterScore = COALESCE(?, quarterScore), quarterPerLevel = ?, cs = COALESCE(?, cs), delta = COALESCE(?, delta),
              growth = COALESCE(?, growth), app = COALESCE(?, app), meets = COALESCE(?, meets), masters = COALESCE(?, masters),
              totalGrowthForQuarter = COALESCE(?, totalGrowthForQuarter), updatedAt = ?
            WHERE studentGrowthRecordId = ?`,
            [payload[5], payload[6], payload[8], payload[9], payload[16], payload[17], payload[18], payload[19], payload[20],
              payload[21], payload[22], payload[23], payload[24], payload[25], nowIso(), existing.studentGrowthRecordId]);
          inserted++;
        } else {
          insert(`
            INSERT INTO student_growth_records (
              districtId, academicYearId, quarterCode, localId, studentName, campusCode, gradeCode, subjectCode,
              teacherIdExternal, teacherName, testLang, specialEducation, economicDisadvantage, emergentBilingual, ethnicity,
              staar, staarPerLevel, quarterScore, quarterPerLevel, cs, delta, growth, app, meets, masters,
              totalGrowthForQuarter, hb1416, hb1416Delta, createdAt
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `, [...payload, nowIso()]);
          inserted++;
        }
      } else if (type === 'student-standards') {
        const localId = pick(row, ['localId', 'studentId']);
        const studentName = pick(row, ['studentName', 'name']);
        const campusCode = upperOrNull(pick(row, ['campusCode', 'campus']));
        const gradeCode = pad2(pick(row, ['grade', 'gradeCode']));
        const subjectCode = upperOrNull(pick(row, ['subject', 'subjectCode']));
        const std = pick(row, ['standardCode', 'standard', 'std']);
        const score = toNumber(pick(row, ['score', 'average', 'value']));
        if (std === null || score === null) { skipped++; continue; }
        const quarter = upperOrNull(pick(row, ['quarter', 'quarterCode'])) || quarterCode;
        insert(`
          INSERT INTO student_standards_scores (
            districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, teacherIdExternal, studentName, standardCode, score, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, academicYearId, quarter, campusCode, gradeCode, subjectCode,
          pick(row, ['teacherId', 'teacherIdExternal']), studentName, std, score, nowIso()]);
        inserted++;
      }
    } catch {
      skipped++;
    }
  }
  // precompute standards averages again if standards data changed
  if (type === 'student-standards' && inserted > 0) {
    recomputeStandardAverages(districtId, academicYearId);
  }
  return [inserted, skipped, 0];
}

function recomputeStandardAverages(districtId, academicYearId) {
  run('DELETE FROM student_standards_averages WHERE districtId = ? AND academicYearId = ?', [districtId, academicYearId]);
  const rows = getAll(`
    SELECT districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, standardCode, AVG(score) AS avgScore
    FROM student_standards_scores WHERE districtId = ? AND academicYearId = ?
    GROUP BY quarterCode, campusCode, gradeCode, subjectCode, standardCode
  `, [districtId, academicYearId]);
  for (const r of rows) {
    insert(`
      INSERT INTO student_standards_averages (districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, standardCode, average, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?)
    `, [r.districtId, r.academicYearId, r.quarterCode, r.campusCode, r.gradeCode, r.subjectCode, r.standardCode, round(r.avgScore, 0), nowIso()]);
  }
}

function toBoolInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).toLowerCase();
  if (['true', 'y', 'yes', '1'].includes(s)) return 1;
  if (['false', 'n', 'no', '0'].includes(s)) return 0;
  return null;
}

function weekdayOf(dateStr) {
  try {
    const d = new Date(dateStr);
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  } catch {
    return null;
  }
}

function normalizeDate(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  } catch { /* fallthrough */ }
  return s.slice(0, 10);
}

function campusForStudent(localId) {
  const row = getOne('SELECT campusCode FROM student_growth_records WHERE localId = ? LIMIT 1', [localId]);
  return row ? row.campusCode : null;
}

// ------------------------------------------------------------- generic routes per type
for (const [type, spec] of Object.entries(TYPES)) {
  // POST create (JSON metadata-only variant) — used by rawscores component flow
  if (type === 'rawscores-uploads') {
    router.post(`/${type}`, (req, res) => {
      const id = insert(
        'INSERT INTO uploads (uploadType, districtId, academicYearId, quarterCode, fileName, uploadedAt, uploadedBy, recordCount, status) VALUES (?,?,?,?,?,?,?,?,?)',
        [type, asNumberOrNull(req.body?.districtId) ?? 0, asNumberOrNull(req.body?.academicYearId), null,
          req.body?.fileName || 'manual.json', nowIso(), req.body?.uploadedBy || 'local-api', 0, 'Completed'],
      );
      const row = getOne('SELECT * FROM uploads WHERE uploadId = ?', [id]);
      return envelope(res, `${spec.label || 'Upload'} created`, uploadRow(row));
    });
  }

  router.post(`/${type}/upload`, upload.single('file'), (req, res) => {
    const id = createUploadRecord(type, req);
    let recordCount = 0;
    let skippedCount = 0;
    let inserted = 0;
    let updated = 0;
    const sheetMessages = [];
    const fileName = req.file ? req.file.originalname : 'manual';

    const extra = {
      districtGoal: asNumberOrNull(q(req, 'districtGoal')),
      estimatedDollarsPerStudent: q(req, 'estimatedDollarsPerStudent') ? String(q(req, 'estimatedDollarsPerStudent')) : undefined,
      scoreMultiplier: asNumberOrNull(q(req, 'scoreMultiplier')),
    };

    try {
      if (!req.file) throw new Error('No file received');
      const parsed = parseWorkbook(req.file.path);
      if (!parsed.rows.length) throw new Error('The uploaded file contains no readable rows');
      [inserted, skippedCount] = insertParsedRows(type, parsed.rows, req, extra);
      recordCount = parsed.rows.length;
      updated = 0;
      if (parsed.sheets.length > 1) sheetMessages.push(`Processed sheet "${parsed.sheets[0]}"`);
      finalizeUpload(type, id, {
        recordCount, skippedCount, insertedCount: inserted, updatedCount: updated,
        skippedRowCount: spec.jsonCreate ? skippedCount : undefined,
        districtGoal: extra.districtGoal, estimatedDollarsPerStudent: extra.estimatedDollarsPerStudent,
        scoreMultiplier: extra.scoreMultiplier,
        status: 'Completed', errorMessage: null, sheetMessages: sheetMessages.length ? JSON.stringify(sheetMessages) : null,
      });
    } catch (e) {
      finalizeUpload(type, id, { status: 'Failed', errorMessage: String(e.message), recordCount: 0 });
      const row = getOne('SELECT * FROM uploads WHERE uploadId = ?', [id]);
      return res.status(400).json({ statusCode: 400, message: String(e.message), data: uploadRow(row) });
    }

    const row = getOne('SELECT * FROM uploads WHERE uploadId = ?', [id]);
    return envelope(res, `Upload processed: ${fileName}`, uploadRow(row));
  });

  // list
  const listHandler = (req, res) => {
    const conds = ['uploadType = ?'];
    const params = [type];
    for (const f of spec.listFilters) {
      const v = asNumberOrNull(req.query[f]);
      if (v !== null) { conds.push(`${f} = ?`); params.push(v); }
    }
    // quarterCode is text (e.g. BOY) — filter it too when provided
    if (spec.listFilters.includes('quarterCode') && req.query.quarterCode) {
      conds.push('quarterCode = ?'); params.push(String(req.query.quarterCode).toUpperCase());
    }
    const rows = getAll(`SELECT * FROM uploads WHERE ${conds.join(' AND ')} ORDER BY uploadedAt DESC`, params);
    return envelope(res, 'Success', rows.map(uploadRow));
  };
  router.get(`/${type}/uploads`, listHandler);
  if (type === 'rawscores-uploads') {
    // list without the /uploads suffix (RawscoresUploadListItem contract); DELETE by bare id
    router.get(`/${type}`, listHandler);
    router.delete(`/${type}/:id`, (req, res) => {
      const row = getOne('SELECT * FROM uploads WHERE uploadId = ? AND uploadType = ?', [Number(req.params.id), type]);
      if (!row) return envelope(res, 'Upload not found', null, 404);
      if (row.storedFileName) {
        const p = path.join(UPLOAD_DIR, row.storedFileName);
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
      }
      run('DELETE FROM uploads WHERE uploadId = ?', [row.uploadId]);
      return envelope(res, 'Upload deleted', null);
    });
  }

  // single
  router.get(`/${type}/upload/:id`, (req, res) => {
    const row = getOne('SELECT * FROM uploads WHERE uploadId = ? AND uploadType = ?', [Number(req.params.id), type]);
    if (!row) return envelope(res, 'Upload not found', null, 404);
    return envelope(res, 'Success', uploadRow(row));
  });

  // delete
  router.delete(`/${type}/uploads/:id`, (req, res) => {
    const row = getOne('SELECT * FROM uploads WHERE uploadId = ? AND uploadType = ?', [Number(req.params.id), type]);
    if (!row) return envelope(res, 'Upload not found', null, 404);
    if (row.storedFileName) {
      const p = path.join(UPLOAD_DIR, row.storedFileName);
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
    }
    run('DELETE FROM uploads WHERE uploadId = ?', [row.uploadId]);
    return envelope(res, 'Upload deleted', null);
  });
}

// keep uploads table's uploadedAt ordering stable on delete
module.exports = router;
