'use strict';
/**
 * Shared utilities: JSON Web Token (HS256, zero deps), password hashing (scrypt),
 * deterministic pseudo-random generator, numeric helpers and normalization.
 */
const crypto = require('crypto');

// ------------------------------------------------------------------ JWT
const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function getJwtSecret() {
    const { DATA_DIR, getMeta, setMeta } = require('./db');
    let secret = getMeta('jwt_secret');
    if (!secret) {
        secret = crypto.randomBytes(32).toString('hex');
        setMeta('jwt_secret', secret);
    }
    return secret;
}

function signToken(payload, expiresInSeconds = 30 * 24 * 60 * 60) {
    const payloadCopy = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
        ...payload,
    };
    const body = Buffer.from(JSON.stringify(payloadCopy)).toString('base64url');
    const sig = crypto.createHmac('sha256', getJwtSecret()).update(`${HEADER_B64}.${body}`).digest('base64url');
    return `${HEADER_B64}.${body}.${sig}`;
}

function verifyToken(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return null;
        const expected = crypto.createHmac('sha256', getJwtSecret()).update(`${parts[0]}.${parts[1]}`).digest('base64url');
        const a = Buffer.from(parts[2]);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ------------------------------------------------------------- passwords
function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), useSalt, 32).toString('hex');
    return { hash, salt: useSalt };
}

function verifyPassword(password, hash, salt) {
    const candidate = crypto.scryptSync(String(password), String(salt), 32).toString('hex');
    const a = Buffer.from(candidate);
    const b = Buffer.from(String(hash));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------- utilities
/** Deterministic 0..1 float from a string seed (stable across runs). */
function seededRandom(text) {
    const h = crypto.createHash('md5').update(String(text)).digest();
    return h.readUInt32BE(0) / 0xffffffff;
}

function round(v, decimals = 1) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
    const f = Math.pow(10, decimals);
    return Math.round(Number(v) * f) / f;
}

/** SQL LIKE escape-free "contains" pattern. */
function contains(value) {
    return `%${String(value).trim()}%`;
}

function asBool(v, dflt = false) {
    if (v === true || v === 'true' || v === 1 || v === '1' || v === 'Y') return true;
    if (v === false || v === 'false' || v === 0 || v === '0' || v === 'N') return false;
    return dflt;
}

function asBoolOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v === true || v === 'true' || v === 1) return true;
    if (v === false || v === 'false' || v === 0) return false;
    return null;
}

function asNumberOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function pad2(v) {
    if (v === null || v === undefined || v === '') return v;
    const s = String(v).trim();
    if (/^\d+$/.test(s) && s.length === 1) return `0${s}`;
    if (/^\d+$/.test(s) && s.length === 2) return s;
    return s;
}

function upperOrNull(v) {
    const s = String(v ?? '').trim();
    return s ? s.toUpperCase() : null;
}

function gradeLetter(pct) {
    if (pct === null || pct === undefined) return null;
    const v = Number(pct);
    if (v >= 90) return 'A';
    if (v >= 80) return 'B';
    if (v >= 70) return 'C';
    if (v >= 60) return 'D';
    return 'F';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

module.exports = {
    signToken,
    verifyToken,
    hashPassword,
    verifyPassword,
    seededRandom,
    round,
    contains,
    asBool,
    asBoolOrNull,
    asNumberOrNull,
    pad2,
    upperOrNull,
    gradeLetter,
    MONTHS,
};
