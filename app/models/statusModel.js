// models/statusModel.js
const dbLayer = require("./db");
const db = dbLayer.db;

module.exports = {

    // ---------------------------------------
    // GET ALL ACTIVE STATUSES (UI ONLY)
    // ---------------------------------------
    getAll() {
        const sql = `
            SELECT
                id,
                name,
                color,
                sort_order,
                is_active,
                exclude_from_reset
            FROM statuses
            WHERE is_active = 1
            ORDER BY sort_order ASC, name ASC
        `;
        return db.prepare(sql).all();
    },

    // ---------------------------------------
    // GET STATUS BY NAME (GENERAL)
    // ---------------------------------------
    getByName(name) {
        return db.prepare(
            `SELECT * FROM statuses WHERE name = ? LIMIT 1`
        ).get(name);
    },

    // ---------------------------------------
    // GET STATUS BY ID (RESET / SYSTEM USE)
    // ⚠️ NO is_active FILTER ON PURPOSE
    // ---------------------------------------
    getById(id) {
        return db.prepare(
            `
            SELECT *
            FROM statuses
            WHERE id = ?
            LIMIT 1
            `
        ).get(id);
    },

    // ---------------------------------------
    // FIRST ACTIVE NON-EXCLUDED (UI HELPERS)
    // ---------------------------------------
    getFirstActiveNonExcluded() {
        return db.prepare(
            `
            SELECT *
            FROM statuses
            WHERE
                is_active = 1
                AND exclude_from_reset = 0
            ORDER BY sort_order ASC, name ASC
            LIMIT 1
            `
        ).get();
    },

    // ---------------------------------------
    // CREATE STATUS
    // ---------------------------------------
    create(name, color, sortOrder, excludeFromReset) {

        const sOrder = Number.isFinite(parseInt(sortOrder, 10))
            ? parseInt(sortOrder, 10)
            : 0;

        const exclude = excludeFromReset ? 1 : 0;

        const result = db.prepare(`
            INSERT INTO statuses (
                name,
                color,
                sort_order,
                exclude_from_reset,
                is_active
            )
            VALUES (?, ?, ?, ?, 1)
        `).run(name, color, sOrder, exclude);

        return result.lastInsertRowid;
    },

    // ---------------------------------------
    // UPDATE STATUS
    // ---------------------------------------
    update(id, name, color, sortOrder, excludeFromReset) {

        const sOrder = parseInt(sortOrder || "0", 10);
        const exclude = excludeFromReset ? 1 : 0;

        db.prepare(`
            UPDATE statuses
            SET
                name = ?,
                color = ?,
                sort_order = ?,
                exclude_from_reset = ?
            WHERE id = ?
        `).run(name, color, sOrder, exclude, id);
    },

    // ---------------------------------------
    // SOFT DELETE STATUS (UI ONLY)
    // ---------------------------------------
    delete(id) {
        db.prepare(
            `UPDATE statuses SET is_active = 0 WHERE id = ?`
        ).run(id);
    }
};