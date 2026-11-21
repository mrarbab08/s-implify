'use strict';
/**
 * SQLite database layer for the local S-Implify backend.
 * Uses Node's built-in node:sqlite (no native npm builds required).
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.SIMPLIFY_DB_PATH || path.join(DATA_DIR, 'simplify.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------------------------------------------------------------- schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS states (
  stateId INTEGER PRIMARY KEY AUTOINCREMENT,
  stateCode TEXT NOT NULL,
  stateName TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS districts (
  districtId INTEGER PRIMARY KEY AUTOINCREMENT,
  stateId INTEGER NOT NULL,
  districtName TEXT NOT NULL,
  districtCode TEXT,
  districtAbbreviation TEXT,
  districtPhone TEXT,
  districtLogo TEXT,
  districtTimeZone TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS academic_years (
  academicYearId INTEGER PRIMARY KEY AUTOINCREMENT,
  yearLabel TEXT NOT NULL,
  startDate TEXT,
  endDate TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS district_quarters (
  districtQuarterId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  academicYearId INTEGER NOT NULL,
  quarterCode TEXT NOT NULL,
  quarterName TEXT,
  startDate TEXT,
  endDate TEXT,
  sortOrder INTEGER,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS district_academies (
  districtAcademyId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  academyCode TEXT NOT NULL,
  academyName TEXT NOT NULL,
  sortOrder INTEGER,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS grades (
  gradeId INTEGER PRIMARY KEY AUTOINCREMENT,
  gradeCode TEXT NOT NULL,
  gradeName TEXT,
  sortOrder INTEGER,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS campus_categories (
  campusCategoryId INTEGER PRIMARY KEY AUTOINCREMENT,
  categoryName TEXT NOT NULL,
  categoryCode TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS campuses (
  campusId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  campusCategoryId INTEGER NOT NULL,
  campusCode TEXT NOT NULL,
  campusIdExternal TEXT,
  campusName TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  subjectId INTEGER PRIMARY KEY AUTOINCREMENT,
  subjectCode TEXT NOT NULL,
  subjectName TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS district_subjects (
  districtSubjectId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  subjectId INTEGER NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS campus_grades (
  campusGradeId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  campusId INTEGER NOT NULL,
  gradeId INTEGER NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS users (
  userId INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  passwordSalt TEXT NOT NULL,
  firstName TEXT,
  lastName TEXT,
  displayName TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  userRoleAssignmentId INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  roleId INTEGER NOT NULL,
  roleName TEXT NOT NULL,
  stateId INTEGER,
  districtId INTEGER,
  campusId INTEGER,
  teacherId INTEGER,
  ttessAccess INTEGER,
  roleDescription TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  createdAt TEXT,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS teachers (
  teacherId INTEGER PRIMARY KEY AUTOINCREMENT,
  teacherIdExternal TEXT UNIQUE,
  districtId INTEGER,
  campusId INTEGER,
  gradeId INTEGER,
  subjectId INTEGER,
  firstName TEXT,
  lastName TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS students (
  studentId INTEGER PRIMARY KEY AUTOINCREMENT,
  localId TEXT UNIQUE,
  firstName TEXT,
  lastName TEXT,
  campusId INTEGER,
  gradeId INTEGER,
  specialEducation INTEGER,
  economicDisadvantage INTEGER,
  emergentBilingual INTEGER,
  ethnicity TEXT,
  testLanguage TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS student_growth_records (
  studentGrowthRecordId INTEGER PRIMARY KEY AUTOINCREMENT,
  growthSheetUploadId INTEGER,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  localId TEXT,
  studentName TEXT,
  campusCode TEXT,
  gradeCode TEXT,
  subjectCode TEXT,
  teacherIdExternal TEXT,
  teacherName TEXT,
  testLang TEXT,
  specialEducation INTEGER,
  economicDisadvantage INTEGER,
  emergentBilingual INTEGER,
  ethnicity TEXT,
  staar INTEGER,
  staarPerLevel REAL,
  quarterScore REAL,
  quarterPerLevel REAL,
  cs REAL,
  delta REAL,
  growth REAL,
  app REAL,
  meets REAL,
  masters REAL,
  totalGrowthForQuarter REAL,
  hb1416 INTEGER,
  hb1416Delta INTEGER,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS campus_attendance_daily (
  recordId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  campusCode TEXT,
  campusName TEXT,
  attendanceDate TEXT,
  dayOfWeek TEXT,
  campusAdaPct REAL,
  campusAda REAL,
  enrollment INTEGER,
  studentsAbsent INTEGER,
  absentCount INTEGER,
  estimatedMissed REAL,
  estimatedMissedFinance REAL,
  absGoal REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS individual_attendance_records (
  recordId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  campusCode TEXT,
  localId TEXT,
  firstName TEXT,
  lastName TEXT,
  totalDaysMembership INTEGER,
  totalDaysAbsent INTEGER,
  totalPia REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS ccmr_monthly_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  calendarMonth TEXT,
  gradeRate REAL,
  ccmrRate REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS ccmr_academy_month_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  school TEXT,
  calendarMonth TEXT,
  totalStudent INTEGER,
  ccmr REAL,
  gradRate REAL,
  onTrack REAL,
  likely REAL,
  notLikely REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS ccmr_records (
  recordId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  calendarMonth TEXT,
  academyCode TEXT,
  school TEXT,
  studentId TEXT,
  firstName TEXT,
  lastName TEXT,
  credit INTEGER,
  campus TEXT,
  grade TEXT,
  planA TEXT,
  planB TEXT,
  ccmrMet INTEGER,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS teacher_assessment_records (
  teacherAssessmentRecordId INTEGER PRIMARY KEY AUTOINCREMENT,
  teacherAssessmentUploadId INTEGER,
  districtId INTEGER,
  academicYearId INTEGER,
  evaluationId TEXT,
  teacherIdExternal TEXT,
  teacherFirstName TEXT,
  teacherLastName TEXT,
  subjects TEXT,
  grade TEXT,
  evaluationDate TEXT,
  appraiserFirstName TEXT,
  appraiserLastName TEXT,
  appraiserTitle TEXT,
  campusCode TEXT,
  gradeCode TEXT,
  subjectCode TEXT,
  walkthrough1Score REAL,
  walkthrough2Score REAL,
  walkthrough3Score REAL,
  walkthrough4Score REAL,
  observation1Score REAL,
  observation2Score REAL,
  summativeScore REAL,
  averageScore REAL,
  growth REAL,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS ttess_assessments (
  ttessAssessmentId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  campusId INTEGER,
  campusCode TEXT,
  teacherId INTEGER,
  teacherIdExternal TEXT,
  teacherFirstName TEXT,
  teacherLastName TEXT,
  observationDate TEXT,
  observationType TEXT,
  evaluatorName TEXT,
  rating1_1 INTEGER,
  rating1_2 INTEGER,
  rating1_3 INTEGER,
  rating1_4 INTEGER,
  rating2_1 INTEGER,
  rating2_2 INTEGER,
  rating2_3 INTEGER,
  rating2_4 INTEGER,
  rating2_5 INTEGER,
  rating3_1 INTEGER,
  rating3_2 INTEGER,
  rating3_3 INTEGER,
  rating4_1 INTEGER,
  rating4_2 INTEGER,
  rating4_3 INTEGER,
  rating4_4 INTEGER,
  commentDomain1 TEXT,
  commentDomain2 TEXT,
  commentDomain3 TEXT,
  commentDomain4 TEXT,
  overallComment TEXT,
  averageScore REAL,
  band TEXT,
  growth REAL,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS student_standards_scores (
  scoreId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  campusCode TEXT,
  gradeCode TEXT,
  subjectCode TEXT,
  teacherIdExternal TEXT,
  studentName TEXT,
  standardCode TEXT,
  score REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS student_standards_averages (
  averageId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  campusCode TEXT,
  gradeCode TEXT,
  subjectCode TEXT,
  teacherIdExternal TEXT,
  standardCode TEXT,
  average REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS student_mobility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  campusCode TEXT,
  totalStudents INTEGER,
  previousTotalStudents INTEGER,
  incomingStudents INTEGER,
  outgoingStudents INTEGER,
  retainedStudents INTEGER,
  netChange INTEGER,
  previousQuarterCode TEXT,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER,
  academicYearId INTEGER,
  ccmrRate REAL,
  graduationRate REAL,
  teachers REAL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS uploads (
  uploadId INTEGER PRIMARY KEY AUTOINCREMENT,
  uploadType TEXT NOT NULL,
  districtId INTEGER,
  academicYearId INTEGER,
  quarterCode TEXT,
  fileName TEXT,
  storedFileName TEXT,
  uploadedAt TEXT,
  uploadedBy TEXT,
  recordCount INTEGER DEFAULT 0,
  skippedCount INTEGER DEFAULT 0,
  insertedCount INTEGER DEFAULT 0,
  updatedCount INTEGER DEFAULT 0,
  skippedRowCount INTEGER,
  updatedRowCount INTEGER,
  scoreMultiplier INTEGER,
  districtGoal REAL,
  estimatedDollarsPerStudent TEXT,
  status TEXT,
  errorMessage TEXT,
  sheetMessages TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgr_district ON student_growth_records (districtId, academicYearId, quarterCode);
CREATE INDEX IF NOT EXISTS idx_sgr_campus ON student_growth_records (campusCode, subjectCode);
CREATE INDEX IF NOT EXISTS idx_sidist ON individual_attendance_records (districtId, academicYearId, quarterCode);
CREATE INDEX IF NOT EXISTS idx_sadist ON student_standards_scores (districtId, academicYearId, quarterCode);
CREATE INDEX IF NOT EXISTS idx_tadist ON teacher_assessment_records (districtId, academicYearId);
CREATE INDEX IF NOT EXISTS idx_ttess_district ON ttess_assessments (districtId, academicYearId, teacherIdExternal);
CREATE INDEX IF NOT EXISTS idx_ura_user ON user_role_assignments (userId);

-- T-TESS rubric (editable per district from the District Profile page).
CREATE TABLE IF NOT EXISTS ttess_domains (
  ttessDomainId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  domainNumber INTEGER NOT NULL,
  domainName TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);
CREATE TABLE IF NOT EXISTS ttess_questions (
  ttessQuestionId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  ttessDomainId INTEGER NOT NULL,
  questionCode TEXT NOT NULL,
  questionText TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);
CREATE TABLE IF NOT EXISTS ttess_options (
  ttessOptionId INTEGER PRIMARY KEY AUTOINCREMENT,
  districtId INTEGER NOT NULL,
  optionLabel TEXT NOT NULL,
  pointValue INTEGER NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT,
  updatedAt TEXT,
  createdBy TEXT,
  updatedBy TEXT
);
CREATE INDEX IF NOT EXISTS idx_ttess_q_district ON ttess_questions (districtId, ttessDomainId);
CREATE INDEX IF NOT EXISTS idx_ttess_opt_district ON ttess_options (districtId);
`;

db.exec(SCHEMA);

/**
 * Lightweight column migrations — existing installs keep their data, new
 * nullable columns are added only when missing.
 */
function ensureColumn(table, column, definition) {
  const cols = getAll(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN [${column}] ${definition}`);
  }
}

// Campuses: contact fields editable from the District Profile page.
ensureColumn('campuses', 'campusAddress', 'TEXT');
ensureColumn('campuses', 'campusPhone', 'TEXT');
ensureColumn('campuses', 'principalName', 'TEXT');
// District quarters: the single "current assessment window" flag (independent
// from isActive so the dashboard quarter filter keeps working).
ensureColumn('district_quarters', 'isCurrentWindow', 'INTEGER NOT NULL DEFAULT 0');
// T-TESS assessments: JSON snapshot of questionId -> points at save time, so
// later rubric edits never reinterpret a saved assessment.
ensureColumn('ttess_assessments', 'ratingsJson', 'TEXT');

// ---------------------------------------------------------------- T-TESS rubric seed
/** The standard 4-domain / 16-dimension T-TESS rubric (codes + labels). */
const STANDARD_TTESS_RUBRIC = {
  domains: [
    { domainNumber: 1, domainName: 'Domain 1 — Planning', questions: [
      ['1.1', 'Standards and Alignment'], ['1.2', 'Data and Assessment'],
      ['1.3', 'Knowledge of Students'], ['1.4', 'Activities'],
    ] },
    { domainNumber: 2, domainName: 'Domain 2 — Instruction', questions: [
      ['2.1', 'Achieving Expectations'], ['2.2', 'Content Knowledge and Expertise'],
      ['2.3', 'Communication'], ['2.4', 'Differentiation'], ['2.5', 'Monitor and Adjust'],
    ] },
    { domainNumber: 3, domainName: 'Domain 3 — Learning Environment', questions: [
      ['3.1', 'Classroom Environment, Routines and Procedures'],
      ['3.2', 'Managing Student Behavior'], ['3.3', 'Classroom Culture'],
    ] },
    { domainNumber: 4, domainName: 'Domain 4 — Professional Practices and Responsibilities', questions: [
      ['4.1', 'Professional Demeanor and Ethics'], ['4.2', 'Goal Setting'],
      ['4.3', 'Professional Development'], ['4.4', 'School Community Involvement'],
    ] },
  ],
  options: [
    ['Improvement Needed', 1], ['Developing', 2], ['Proficient', 3],
    ['Accomplished', 4], ['Distinguished', 5],
  ],
};

/**
 * Seed the standard T-TESS rubric for every district that has none yet, so the
 * "+ New Assessment" form reads from the database with zero visual change.
 */
function seedTtessRubrics() {
  const districts = getAll('SELECT districtId FROM districts ORDER BY districtId');
  for (const d of districts) {
    const existing = getOne('SELECT ttessDomainId FROM ttess_domains WHERE districtId = ? LIMIT 1', [d.districtId]);
    if (existing) continue;
    const ts = nowIso();
    for (const dom of STANDARD_TTESS_RUBRIC.domains) {
      const domainId = insert(
        'INSERT INTO ttess_domains (districtId, domainNumber, domainName, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,1,?,?)',
        [d.districtId, dom.domainNumber, dom.domainName, dom.domainNumber, ts, 'rubric-seed'],
      );
      dom.questions.forEach(([code, label], i) => {
        insert(
          'INSERT INTO ttess_questions (districtId, ttessDomainId, questionCode, questionText, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,1,?,?)',
          [d.districtId, domainId, code, label, i + 1, ts, 'rubric-seed'],
        );
      });
    }
    STANDARD_TTESS_RUBRIC.options.forEach(([label, points], i) => {
      insert(
        'INSERT INTO ttess_options (districtId, optionLabel, pointValue, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,1,?,?)',
        [d.districtId, label, points, i + 1, ts, 'rubric-seed'],
      );
    });
  }
}

seedTtessRubrics();

// ---------------------------------------------------------------- helpers
/**
 * node:sqlite only accepts null, number, bigint, string or Buffer values.
 * Express request bodies and route handlers routinely pass JS booleans
 * (`isActive`, `ttessAccess`, ...) and `undefined` for optional columns, and
 * binding those throws "Provided value cannot be bound to SQLite parameter".
 * Normalize every parameter once, here, so no query has to care.
 */
function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(normalizeValue);
}

function getOne(sql, params = []) {
  return db.prepare(sql).get(...normalizeParams(params));
}

function getAll(sql, params = []) {
  return db.prepare(sql).all(...normalizeParams(params));
}

/** INSERT returns last inserted rowid. */
function insert(sql, params = []) {
  const res = db.prepare(sql).run(...normalizeParams(params));
  return Number(res.lastInsertRowid);
}

/** UPDATE / DELETE returns number of affected rows. */
function run(sql, params = []) {
  const res = db.prepare(sql).run(...normalizeParams(params));
  return Number(res.changes);
}

function exec(sql) {
  db.exec(sql);
}

function getMeta(key) {
  const row = getOne('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setMeta(key, value) {
  run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  db,
  DB_PATH,
  DATA_DIR,
  normalizeParams,
  getOne,
  getAll,
  insert,
  run,
  exec,
  getMeta,
  setMeta,
  nowIso,
};
