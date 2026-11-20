'use strict';
/**
 * /api/ttess-rubric — the per-district T-TESS rubric (domains, questions/dimensions
 * and answer options) edited from the District Profile page and read by the
 * "+ New Assessment" form on the T-TESS & Students page.
 *
 * Every district is seeded with the standard rubric on startup (see db.js), so the
 * form reads from the database with zero visual change on day one. Editing text,
 * options or order never touches saved assessments: each save stores a JSON
 * snapshot of the ratings (ttess_assessments.ratingsJson) and the score/band were
 * already computed at save time.
 */
const express = require('express');
const { getOne, getAll, insert, run, nowIso } = require('../db');

const router = express.Router();

function envelope(res, message, data, statusCode = 200) {
  return res.status(statusCode).json({ statusCode, message, data });
}

const numOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Domains + active/inactive questions for one district, questions nested per domain. */
function rubricFor(districtId) {
  const domains = getAll(
    'SELECT * FROM ttess_domains WHERE districtId = ? ORDER BY sortOrder, domainNumber',
    [districtId],
  );
  const questions = getAll(
    'SELECT * FROM ttess_questions WHERE districtId = ? ORDER BY sortOrder, ttessQuestionId',
    [districtId],
  );
  const options = getAll(
    'SELECT * FROM ttess_options WHERE districtId = ? ORDER BY sortOrder, ttessOptionId',
    [districtId],
  );
  const bool = (v) => !!v;
  return {
    districtId,
    domains: domains.map((d) => ({
      ttessDomainId: d.ttessDomainId,
      districtId: d.districtId,
      domainNumber: d.domainNumber,
      domainName: d.domainName,
      sortOrder: d.sortOrder,
      isActive: bool(d.isActive),
      questions: questions
        .filter((q) => q.ttessDomainId === d.ttessDomainId)
        .map((q) => ({
          ttessQuestionId: q.ttessQuestionId,
          districtId: q.districtId,
          ttessDomainId: q.ttessDomainId,
          domainNumber: d.domainNumber,
          questionCode: q.questionCode,
          questionText: q.questionText,
          sortOrder: q.sortOrder,
          isActive: bool(q.isActive),
        })),
    })),
    options: options.map((o) => ({
      ttessOptionId: o.ttessOptionId,
      districtId: o.districtId,
      optionLabel: o.optionLabel,
      pointValue: o.pointValue,
      sortOrder: o.sortOrder,
      isActive: bool(o.isActive),
    })),
  };
}

/** GET /api/ttess-rubric?districtId=1 */
router.get('/ttess-rubric', (req, res) => {
  const districtId = numOrNull(req.query.districtId);
  if (districtId == null) {
    return envelope(res, 'districtId is required', null, 400);
  }
  return envelope(res, 'Success', rubricFor(districtId));
});

/** PUT /api/ttess-rubric/domains/:id — rename a domain (names are editable). */
router.put('/ttess-rubric/domains/:id', (req, res) => {
  const id = Number(req.params.id);
  const domain = getOne('SELECT * FROM ttess_domains WHERE ttessDomainId = ?', [id]);
  if (!domain) return envelope(res, 'Domain not found', null, 404);
  const body = req.body || {};
  const domainName = String(body.domainName ?? '').trim();
  if (!domainName) return envelope(res, 'Domain name is required', null, 400);
  run(
    'UPDATE ttess_domains SET domainName = ?, updatedAt = ?, updatedBy = ? WHERE ttessDomainId = ?',
    [domainName, nowIso(), body.updatedBy || 'local-api', id],
  );
  return envelope(res, 'Domain updated', rubricFor(domain.districtId));
});

/** POST /api/ttess-rubric/questions — add a question under any domain. */
router.post('/ttess-rubric/questions', (req, res) => {
  const body = req.body || {};
  const districtId = numOrNull(body.districtId);
  const domainId = numOrNull(body.ttessDomainId);
  const questionCode = String(body.questionCode ?? '').trim();
  const questionText = String(body.questionText ?? '').trim();
  if (districtId == null || domainId == null || !questionCode || !questionText) {
    return envelope(res, 'districtId, ttessDomainId, questionCode and questionText are required', null, 400);
  }
  const domain = getOne(
    'SELECT * FROM ttess_domains WHERE ttessDomainId = ? AND districtId = ?',
    [domainId, districtId],
  );
  if (!domain) return envelope(res, 'Domain not found for this district', null, 404);
  const maxOrder = getOne(
    'SELECT MAX(sortOrder) AS m FROM ttess_questions WHERE ttessDomainId = ?',
    [domainId],
  );
  const id = insert(
    'INSERT INTO ttess_questions (districtId, ttessDomainId, questionCode, questionText, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,1,?,?)',
    [districtId, domainId, questionCode, questionText, (maxOrder?.m ?? 0) + 1, nowIso(), body.createdBy || 'local-api'],
  );
  return envelope(res, 'Question added', rubricFor(districtId));
});

/**
 * PUT /api/ttess-rubric/questions/reorder — sortOrder follows the given id array
 * (within each question's own domain). Deactivated questions keep their spot.
 * NOTE: defined BEFORE the /questions/:id route below, otherwise Express matches
 * "reorder" as :id and the reorder call 404s.
 */
router.put('/ttess-rubric/questions/reorder', (req, res) => {
  const body = req.body || {};
  const districtId = numOrNull(body.districtId);
  const ids = Array.isArray(body.ttessQuestionIds) ? body.ttessQuestionIds.map(Number).filter(Number.isFinite) : [];
  if (districtId == null) return envelope(res, 'districtId is required', null, 400);
  if (!ids.length) return envelope(res, 'ttessQuestionIds array is required', null, 400);
  const ts = nowIso();
  for (let i = 0; i < ids.length; i++) {
    run(
      'UPDATE ttess_questions SET sortOrder = ?, updatedAt = ? WHERE ttessQuestionId = ? AND districtId = ?',
      [i + 1, ts, ids[i], districtId],
    );
  }
  return envelope(res, 'Questions reordered', rubricFor(districtId));
});

/** PUT /api/ttess-rubric/questions/:id — edit code/text or activate/deactivate. */
router.put('/ttess-rubric/questions/:id', (req, res) => {
  const id = Number(req.params.id);
  const question = getOne('SELECT * FROM ttess_questions WHERE ttessQuestionId = ?', [id]);
  if (!question) return envelope(res, 'Question not found', null, 404);
  const body = req.body || {};
  const questionCode = body.questionCode !== undefined ? String(body.questionCode).trim() : question.questionCode;
  const questionText = body.questionText !== undefined ? String(body.questionText).trim() : question.questionText;
  if (!questionCode || !questionText) return envelope(res, 'Question code and text are required', null, 400);
  const isActive = body.isActive === undefined ? question.isActive : (body.isActive ? 1 : 0);
  run(
    'UPDATE ttess_questions SET questionCode = ?, questionText = ?, isActive = ?, updatedAt = ?, updatedBy = ? WHERE ttessQuestionId = ?',
    [questionCode, questionText, isActive, nowIso(), body.updatedBy || 'local-api', id],
  );
  return envelope(res, 'Question updated', rubricFor(question.districtId));
});

/**
 * PUT /api/ttess-rubric/options — edit the rating-scale labels and point values
 * (bulk). Score formula (average ÷ max points × 100) keeps working because the
 * maximum is derived from the active options at save time.
 */
router.put('/ttess-rubric/options', (req, res) => {
  const body = req.body || {};
  const districtId = numOrNull(body.districtId);
  if (districtId == null) return envelope(res, 'districtId is required', null, 400);
  const list = Array.isArray(body.options) ? body.options : [];
  if (!list.length) return envelope(res, 'options array is required', null, 400);
  const ts = nowIso();
  for (const o of list) {
    const id = numOrNull(o.ttessOptionId);
    if (id == null) continue;
    const existing = getOne('SELECT * FROM ttess_options WHERE ttessOptionId = ? AND districtId = ?', [id, districtId]);
    if (!existing) continue;
    const optionLabel = o.optionLabel !== undefined ? String(o.optionLabel).trim() : existing.optionLabel;
    const pointValue = o.pointValue !== undefined ? numOrNull(o.pointValue) : existing.pointValue;
    if (!optionLabel || pointValue == null || pointValue < 0) {
      return envelope(res, 'Each option needs a label and a point value of 0 or more', null, 400);
    }
    const isActive = o.isActive === undefined ? existing.isActive : (o.isActive ? 1 : 0);
    run(
      'UPDATE ttess_options SET optionLabel = ?, pointValue = ?, isActive = ?, updatedAt = ?, updatedBy = ? WHERE ttessOptionId = ?',
      [optionLabel, pointValue, isActive, ts, body.updatedBy || 'local-api', id],
    );
  }
  return envelope(res, 'Rating scale updated', rubricFor(districtId));
});

module.exports = router;
