// jobs/dailyStatusReset.js
const dbLayer = require("../models/db");
const Settings = require("../models/settingsModel");

const db = dbLayer.db;
let lastRunDate = null;

// Local YYYY-MM-DD (prevents UTC date rollover issues)
function getLocalDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * HARD RESET STATUSES TO "Out of Office"
 */
function resetStatuses(mode = "daily") {

    const comment =
        mode === "manual" ? "Manual reset" : "Daily automatic reset";

    const nowUTC = new Date().toISOString();

    const sql = `
        INSERT INTO staff_status (
            user_id,
            status_id,
            location_id,
            returning_at,
            comment,
            timestamp
        )
        SELECT
            u.id,
            s.id,
            NULL,
            NULL,
            ?,
            ?
        FROM users u
        JOIN statuses s ON s.name = 'Out of Office'
        WHERE u.is_system = 0
          AND u.is_active = 1
          AND u.id NOT IN (
              SELECT ss.user_id
              FROM staff_status ss
              JOIN statuses st ON st.id = ss.status_id
              WHERE st.exclude_from_reset = 1
                AND ss.timestamp = (
                    SELECT MAX(timestamp)
                    FROM staff_status
                    WHERE user_id = ss.user_id
                )
          );
    `;

    const result = db.prepare(sql).run(comment, nowUTC);

    return result.changes;
}

/**
 * Runs once per day at 23:59 local server time
 */
function dailyTick() {

    try {
        const now = new Date();
        const hh = now.getHours();
        const mm = now.getMinutes();
        const today = getLocalDateKey(now);

        if (!(hh === 23 && mm === 59)) return;
        if (lastRunDate === today) return;

        const settings = Settings.getAll();

        if (settings.daily_reset_enabled !== "1") return;

        resetStatuses("daily");

        lastRunDate = today;

        Settings.set("last_daily_reset_date", today);

        console.log("✅ DAILY RESET EXECUTED @ 23:59");

    } catch (err) {
        console.error("❌ DAILY RESET FAILED", err);
    }
}

/**
 * Start scheduler
 */
function startDailyStatusReset() {
    console.log("🧠 Initialising daily status reset scheduler (explicit)");
    setInterval(dailyTick, 60 * 1000);
}

/**
 * Manual admin-triggered reset
 */
function runManualReset() {
    return resetStatuses("manual");
}

module.exports = {
    startDailyStatusReset,
    runManualReset
};