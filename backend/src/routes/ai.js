'use strict';
/**
 * AI chat bridge — S-Implify AI Bot ⇄ LLM (OpenAI Chat Completions OR Gemini generateContent).
 *
 * The API key lives ONLY here (backend/ai-config.json) or in env vars —
 * it is never exposed to the frontend bundle.
 *
 * Contract consumed by the Angular bot:
 *   POST /api/ai/chat  { message, history?: [{role, content}], context?: {...} }
 *   → 200 { statusCode: 200, message: 'OK', data: { reply: string } }
 *   → 418 when the key is not configured yet
 *   → 502 when the provider itself fails (network/quota)
 */
const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();

const CONFIG_PATH = path.join(__dirname, '..', '..', 'ai-config.json');

function loadConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_e) {
    console.error('[ai] config read/parse failed:', _e.message);
    /* config file optional — fall back to env vars */
  }
  if (process.env.DEBUG_AI === '1') {
    console.error('[ai] fileCfg keys:', Object.keys(fileCfg).join(','), '| apiKey head:', (fileCfg.apiKey || '').slice(0, 8));
  }
  return {
    apiKey: fileCfg.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: fileCfg.model || process.env.AI_MODEL || 'gpt-4o-mini',
    provider: (fileCfg.provider || process.env.AI_PROVIDER || 'openai').toLowerCase(),
    openaiUrl: fileCfg.baseUrl || 'https://api.openai.com/v1/chat/completions',
    geminiUrl:
      fileCfg.geminiUrl ||
      'https://generativelanguage.googleapis.com/v1beta/models',
  };
}

function keyIsConfigured(apiKey) {
  if (!apiKey) return false;
  // Accept OpenAI (sk-…), classic Gemini (AIza…) and AI Studio keys (AQ.Ab…)
  if (/^PASTE_/i.test(apiKey)) return false;
  const looksLikeKey = /^(sk-|AIza|AQ\.)/.test(apiKey) || apiKey.length >= 30;
  return looksLikeKey && apiKey.length >= 20;
}

const SYSTEM_PROMPT = [
  'You are "S-Implify AI Bot", the friendly built-in assistant AND real-time data analyst of the S-Implify education-analytics web portal.',
  'S-Implify is a district-level analytics portal for US schools: it tracks campuses (schools) inside districts,',
  'teachers per campus, students, STAAR component-score KPIs, growth percentages, attendance and T-TESS teacher evaluations.',
  'Main pages you can send users to:',
  '• /dashboard — Districts Overview: top stat cards (Districts, Campuses, Teachers) that open detail popups, KPI cards (STAAR Component Score, Growth, etc.) and the Campuses Overview chart.',
  '• /dashboard/campus/<slug> — an individual campus dashboard (slug is provided in the live context).',
  '• /dashboard/campus/<slug>/teacher/<teacherId> — a teacher drill-down inside a campus.',
  '• /t-tess — teacher evaluation (T-TESS).',
  '• /students — students across campuses.',
  '• /attendance — campus attendance summary; /attendance/individual — single student attendance.',
  '• /data-uploads — upload campus data files (Excel/CSV).',
  '• /user-setups — manage accounts, roles and campus assignments.',
  '',
  'Rules:',
  '• Be warm, friendly and use at most 1-2 emojis. Use plain English — the chat renders plain text, so NO markdown tables.',
  '• You are a real-time data analyst. When the user asks for an analysis, summary, report, comparison, ranking or asks how campuses/classrooms/teachers are doing, quote the ACTUAL numbers from the "analytics" section of the live context.',
  '• Format data replies as a compact plain-text list, best performers first, exactly like this:',
  '    District snapshot — STAAR 62.3% | Growth 57.6%',
  '    • King Middle School — STAAR 71.9% | Growth 68.2%',
  '    • Null Middle School — STAAR 61.4% | Growth 56.4%',
  '  Start with a one-line takeaway using analytics.districtOverall, then list analytics.campuses (campus questions) or analytics.topClassrooms (classroom questions), and close with one short insight (top vs lowest performer, or the spread). Keep data replies under ~160 words.',
  '• Use the LIVE CONTEXT to answer factual questions about counts, names and people. Never invent numbers, campus names or people that are not in the live context.',
  '• If the live context has no analytics (analytics.available === false) or has errors, say the dashboard context is still loading and answer with whatever counts you do have.',
  '• If the live context contains no data at all, say so honestly and suggest restarting the backend.',
  '• When you recommend a page, your reply SHOULD end with a single line in exactly this format:',
  'LINKS: Label|/route ;; Label2|/route2',
  '(up to 3 links, each route starting with /). The portal turns that line into clickable buttons and strips it from your text, so do not mention the raw syntax in prose.',
  '• If the user asks who made you or your nature: you are the S-Implify AI Bot running on Gemini inside their local portal.',
].join('\n');

router.post('/ai/chat', async (req, res) => {
  const cfg = loadConfig();
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 2000);
  const history = Array.isArray(req.body && req.body.history) ? req.body.history.slice(-10) : [];
  const context = (req.body && req.body.context) || {};

  if (!message) {
    return res.status(400).json({ statusCode: 400, message: 'message is required', data: null });
  }

  if (!keyIsConfigured(cfg.apiKey)) {
    return res.status(418).json({
      statusCode: 418,
      message: 'AI key not configured',
      data: { hint: 'Paste your API key into backend/ai-config.json (provider: gemini or openai) and restart the backend.' },
    });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content:
        'LIVE CONTEXT (from the S-Implify database at ' +
        new Date().toISOString() +
        '):\n' +
        JSON.stringify(context).slice(0, 6000),
    },
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: 'user', content: message },
  ];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const isGemini = cfg.provider === 'gemini';
    let url;
    let init;
    if (isGemini) {
      // Gemini generateContent API (system prompt via systemInstruction)
      const geminiContents = [];
      for (const m of messages) {
        if (m.role === 'user') geminiContents.push({ role: 'user', parts: [{ text: m.content }] });
        else if (m.role === 'assistant') geminiContents.push({ role: 'model', parts: [{ text: m.content }] });
      }
      url = `${cfg.geminiUrl}/${cfg.model}:generateContent`;
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT + '\n\nLIVE CONTEXT:\n' + JSON.stringify(context).slice(0, 6000) }],
          },
          contents: geminiContents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
        }),
      };
    } else {
      url = cfg.openaiUrl;
      init = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.6, max_tokens: 600 }),
      };
    }

    // Retry transient provider hiccups ("high demand", 429/503) with backoff.
    const isTransient = (detail) =>
      /high demand|overload|unavailable|rate.?limit|quota|too many requests|service unavailable|429|503/i.test(detail);
    let r;
    let out = {};
    let detail = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(url, { ...init, signal: controller.signal });
      out = await r.json().catch(() => ({}));
      if (r.ok) break;
      detail = (out.error && (out.error.message || out.error.code || out.error.status)) || `HTTP ${r.status}`;
      if (attempt < 2 && isTransient(detail)) {
        console.error(`[ai] transient provider error (attempt ${attempt + 1}), retrying:`, detail);
        await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
        continue;
      }
      break;
    }
    clearTimeout(timer);

    if (!r.ok) {
      console.error('AI provider error:', detail);
      return res.status(502).json({
        statusCode: 502,
        message: 'AI request failed',
        data: { detail },
      });
    }

    let reply = '';
    if (isGemini) {
      const cand = out.candidates && out.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      reply = (parts || []).map((p) => p.text || '').join('');
    } else {
      reply = (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || '';
    }
    if (!reply.trim()) {
      return res.status(502).json({ statusCode: 502, message: 'Empty reply from AI provider', data: null });
    }
    return res.json({ statusCode: 200, message: 'OK', data: { reply } });
  } catch (err) {
    console.error('AI fetch failed:', err && err.message);
    return res.status(502).json({
      statusCode: 502,
      message: 'Could not reach the AI provider',
      data: { detail: (err && err.message) || 'unknown error' },
    });
  }
});

module.exports = router;
