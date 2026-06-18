// utils/logger.js
const dbLayer = require("../models/db");

// --------------------------------------------------
// WRITE LOG
// --------------------------------------------------
function logAction({ action, entity, entityId, targetName, user }) {
    const actorId = user?.id || null;
    const actorName = user?.name || "System";
    const actorRole = user?.role || "system";
    const nowUTC = new Date().toISOString();

    if (dbLayer.type === "sqlite") {
        try {
            // IMPORTANT: don't cache db at require-time
            const db = dbLayer.db;

            db.prepare(`
                INSERT INTO logs (
                    action,
                    entity,
                    entity_id,
                    target_name,
                    user_id,
                    user_name,
                    user_role,
                    timestamp
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                action,
                entity,
                entityId ?? null,
                targetName ?? null,
                actorId,
                actorName,
                actorRole,
                nowUTC
            );
        } catch (err) {
            console.error("❌ Log write failed:", err);
        }
        return;
    }

    // Postgres
    const db = dbLayer.db;
    db.query(
        `
        INSERT INTO logs (
            action,
            entity,
            entity_id,
            target_name,
            user_id,
            user_name,
            user_role,
            timestamp
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
            action,
            entity,
            entityId ?? null,
            targetName ?? null,
            actorId,
            actorName,
            actorRole,
            nowUTC
        ]
    );
}

// --------------------------------------------------
// READ LOGS (ADMIN UI)
// --------------------------------------------------
function getLogs() {
    if (dbLayer.type === "sqlite") {
        try {
            const db = dbLayer.db;

            const exists = db
                .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='logs'`)
                .get();

            if (!exists) {
                return [];
            }

            const rows = db.prepare(`
                SELECT
                    l.*,
                    u.name AS resolved_user_name,
                    tu.name AS resolved_target_name
                FROM logs l
                LEFT JOIN users u
                    ON u.id = l.user_id
                LEFT JOIN users tu
                    ON tu.id = CAST(l.entity_id AS INTEGER)
                   AND l.entity = 'user'
                ORDER BY l.timestamp DESC
                LIMIT 500
            `).all();

            return (rows || []).map(r => ({
                ...r,
                user_name: r.user_name || r.resolved_user_name || "System",
                target_name: r.target_name || r.resolved_target_name || null
            }));

        } catch (err) {
            console.error("❌ getLogs failed:", err);
            return [];
        }
    }

    // Postgres (still async)
    return dbLayer.db.query(`
        SELECT *
        FROM logs
        ORDER BY timestamp DESC
        LIMIT 500
    `)
    .then(result => result.rows || [])
    .catch(err => {
        console.error("❌ getLogs failed:", err);
        return [];
    });
}

module.exports = {
    logAction,
    getLogs
};