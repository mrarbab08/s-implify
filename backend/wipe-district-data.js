const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/simplify.db');

const KEEP = new Set([
    'districts', 'district_quarters', 'district_academies', 'campuses',
    'district_subjects', 'campus_grades', 'user_role_assignments', 'teachers',
]);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
const results = [];
for (const t of tables) {
    if (KEEP.has(t)) continue;
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    if (!cols.includes('districtId')) continue;
    const before = db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE districtId IN (1, 2)`).get().c;
    if (before === 0) continue;
    const res = db.prepare(`DELETE FROM ${t} WHERE districtId IN (1, 2)`).run();
    results.push({ table: t, deleted: res.changes });
}
console.log(JSON.stringify(results, null, 1));
const total = results.reduce((a, r) => a + r.deleted, 0);
console.log('total deleted:', total);
db.close();
