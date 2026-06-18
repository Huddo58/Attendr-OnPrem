// routes/status.js
const express = require("express");
const router = express.Router();

const dbLayer = require("../models/db");
const db = dbLayer.db;
const { logAction } = require("../utils/logger");
const licenseGuard = require("../middleware/licenseGuard");

// ------------------------------
// REQUIRE LOGIN
// ------------------------------
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

// ------------------------------
// UPDATE STATUS
// ------------------------------
router.post(
    "/status/update",
    requireLogin,
    licenseGuard,
    (req, res) => {

        const {
            user_id,
            status_id,
            returning_at,
            unknown_return,
            comment,
            location_id,
            active_tab
        } = req.body;

        const userId = parseInt(user_id, 10);
        const statusId = parseInt(status_id, 10);

        const locationId =
            location_id && location_id !== ""
                ? parseInt(location_id, 10)
                : null;

        if (!Number.isInteger(userId) || !Number.isInteger(statusId)) {
            return res.status(400).send("Invalid user or status.");
        }

        let returningValue = null;

        if (!unknown_return && returning_at) {
            const d = new Date(returning_at);

            returningValue =
                d.getFullYear() + "-" +
                String(d.getMonth() + 1).padStart(2, "0") + "-" +
                String(d.getDate()).padStart(2, "0") + " " +
                String(d.getHours()).padStart(2, "0") + ":" +
                String(d.getMinutes()).padStart(2, "0") + ":00";
        }

        const commentValue = comment || "";
        const redirectTab = active_tab || "ALL";
        const nowUTC = new Date().toISOString();

        const getPreviousStatusSql = `
            SELECT s.name
            FROM staff_status ss
            JOIN statuses s ON s.id = ss.status_id
            WHERE ss.user_id = ?
            ORDER BY ss.timestamp DESC
            LIMIT 1
        `;

        const getNewStatusNameSql = `
            SELECT name FROM statuses WHERE id = ?
        `;

        const getTargetUserNameSql = `
            SELECT name FROM users WHERE id = ?
        `;

        // ---------------------------------
        // SQLITE (SYNC)
        // ---------------------------------
        if (dbLayer.type === "sqlite") {

            try {

                const userRow = db.prepare(getTargetUserNameSql).get(userId);
                const targetName = userRow?.name || `user #${userId}`;

                const prevRow = db.prepare(getPreviousStatusSql).get(userId);
                const previousStatusName = prevRow?.name || "none";

                const newRow = db.prepare(getNewStatusNameSql).get(statusId);
                const newStatusName = newRow?.name || statusId;

                const insertSql = `
                    INSERT INTO staff_status (
                        user_id,
                        status_id,
                        location_id,
                        returning_at,
                        comment,
                        timestamp
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `;

                db.prepare(insertSql).run(
                    userId,
                    statusId,
                    locationId,
                    returningValue,
                    commentValue,
                    nowUTC
                );

                logAction({
                    action: `changed status (${previousStatusName} → ${newStatusName})`,
                    entity: "user",
                    entityId: userId,
                    targetName,
                    user: req.session.user
                });

                return res.redirect(
                    "/dashboard?dept=" + encodeURIComponent(redirectTab)
                );

            } catch (err) {
                console.error("❌ Status update failed:", err);
                return res.status(500).send("Database error saving status.");
            }
        }

        // ---------------------------------
        // POSTGRES (UNCHANGED)
        // ---------------------------------
        const pgUserSql = `SELECT name FROM users WHERE id = $1`;

        const pgPrevSql = `
            SELECT s.name
            FROM staff_status ss
            JOIN statuses s ON s.id = ss.status_id
            WHERE ss.user_id = $1
            ORDER BY ss.timestamp DESC
            LIMIT 1
        `;

        const pgNewSql = `
            SELECT name FROM statuses WHERE id = $1
        `;

        db.query(pgUserSql, [userId], (err, userResult) => {
            const targetName = userResult?.rows?.[0]?.name || `user #${userId}`;

            db.query(pgPrevSql, [userId], (err, prevResult) => {
                const previousStatusName = prevResult?.rows?.[0]?.name || "none";

                db.query(pgNewSql, [statusId], (err, newResult) => {
                    const newStatusName = newResult?.rows?.[0]?.name || statusId;

                    const pgInsertSql = `
                        INSERT INTO staff_status (
                            user_id,
                            status_id,
                            location_id,
                            returning_at,
                            comment,
                            timestamp
                        )
                        VALUES ($1, $2, $3, $4, $5, NOW())
                    `;

                    db.query(
                        pgInsertSql,
                        [
                            userId,
                            statusId,
                            locationId,
                            returningValue,
                            commentValue
                        ],
                        (err) => {
                            if (err) {
                                console.error("❌ PG Status update failed:", err);
                                return res.status(500).send("Database error saving status.");
                            }

                            logAction({
                                action: `changed status (${previousStatusName} → ${newStatusName})`,
                                entity: "user",
                                entityId: userId,
                                targetName,
                                user: req.session.user
                            });

                            return res.redirect(
                                "/dashboard?dept=" + encodeURIComponent(redirectTab)
                            );
                        }
                    );
                });
            });
        });
    }
);

module.exports = router;