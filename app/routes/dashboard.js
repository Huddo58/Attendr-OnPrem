// routes/dashboard.js
console.log("📌 Dashboard routes loaded");
 
const express = require("express");
const router  = express.Router();
 
const dbLayer = require("../models/db");
const db      = dbLayer.db;
 
const User       = require("../models/userModel");
const Department = require("../models/departmentModel");
const Status     = require("../models/statusModel");
const Location   = require("../models/locationModel");
const Profile    = require("../models/profileModel");
const { logAction } = require("../utils/logger");
const { detectLocationFromRequest } = require("../utils/detectLocation");
 
// ------------------------------
// REQUIRE LOGIN
// ------------------------------
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}
 

 
// ------------------------------
// SMART AUTO-STATUS UPDATE
// Fires on every dashboard load where a location is detected.
// Always updates when location changes — manual status is
// respected only until the next location change is detected.
//
// Logic:
//   1. Is detected location same as current? → do nothing
//   2. Location changed →
//      a. Does user have preferences set?
//         - New location = home location → apply home status
//         - New location ≠ home location → apply away status
//      b. No preferences set → update location only
// ------------------------------
function smartAutoUpdate(userId, detectedLocation, session) {
    try {
 
        // Get user's current status record
        const current = db.prepare(`
            SELECT id, status_id, location_id, returning_at, comment
            FROM staff_status
            WHERE user_id = ?
            ORDER BY datetime(timestamp) DESC, id DESC
            LIMIT 1
        `).get(userId);

        // ------------------------------------------------------------------
        // Only the IP-DETECTED location actually MOVING counts as a
        // "location change". We compare the freshly detected location against
        // the LAST DETECTED location (remembered on the session) — NOT against
        // the user's current stored location.
        //
        // Why: if we compared against the stored location, a manual override
        // that sets a *different* location (e.g. "heading to Robina") would
        // look like a location change on the very next poll and get instantly
        // reset back to the IP-detected location. Comparing against the last
        // detected network instead means manual overrides (status, or status +
        // location) survive until the user genuinely connects to a different
        // network.
        //
        // First detection of a session has no session baseline yet, so we fall
        // back to the user's current stored location. That suppresses a
        // redundant write when they're already where their IP says, while
        // still clearing a stale override left over from a previous session.
        // ------------------------------------------------------------------
        const sessionLast =
            (session && session.lastDetectedLocationId != null)
                ? session.lastDetectedLocationId
                : null;

        const baselineId =
            sessionLast != null
                ? sessionLast
                : (current ? current.location_id : null);

        if (baselineId === detectedLocation.id) {
            // Network unchanged since last detection — respect whatever the
            // user currently has (including manual overrides). Seed/refresh
            // the session baseline so subsequent polls stay stable.
            if (session) session.lastDetectedLocationId = detectedLocation.id;
            return { changed: false, reason: "network_unchanged" };
        }
 
        const nowUTC = new Date().toISOString();
 
        // Load user's status preferences
        const prefs = Profile.getStatusPreferences(userId);
 
        // Determine target status based on preferences
        const isHomeLocation = prefs &&
            prefs.default_location_id &&
            prefs.default_location_id === detectedLocation.id;
 
        let targetStatusId = null;
 
        if (prefs) {
            if (isHomeLocation && prefs.home_status_id) {
                targetStatusId = prefs.home_status_id;
            } else if (!isHomeLocation && prefs.away_status_id) {
                targetStatusId = prefs.away_status_id;
            }
        }
 
        // If no target status from preferences, preserve current status
        // or leave blank if no current status exists
        if (!targetStatusId && current) {
            targetStatusId = current.status_id;
        }
 
        if (!targetStatusId) {
            // No current status and no preferences — location only
            // Can't insert without a status_id, so do nothing
            return { changed: false, reason: "no_status_available" };
        }
 
        // Insert new record with updated location
        db.prepare(`
            INSERT INTO staff_status (
                user_id, status_id, location_id,
                returning_at, comment, timestamp
            ) VALUES (?, ?, ?, NULL, 'System location update', ?)
        `).run(userId, targetStatusId, detectedLocation.id, nowUTC);
 
        logAction({
            action: `system auto-set location to ${detectedLocation.name} (${isHomeLocation ? 'home' : 'away'})`,
            entity: "user",
            entityId: userId,
            user: { id: 0, name: "System", role: "system" }
        });

        // Network has moved and we've applied it — advance the session
        // baseline so we don't re-fire on the next poll.
        if (session) session.lastDetectedLocationId = detectedLocation.id;

        return {
            changed: true,
            locationId: detectedLocation.id,
            locationName: detectedLocation.name,
            statusId: targetStatusId
        };
 
    } catch (err) {
        console.error("❌ smartAutoUpdate error:", err.message);
        return { changed: false, reason: "error", error: err.message };
    }
}


// ------------------------------
// LIVE POLLING ENDPOINT
// GET /api/dashboard-data
//
// UPDATED: Also runs smartAutoUpdate on every poll.
// This means even when the dashboard tab is hidden or
// the laptop lid is closed, as long as the browser is
// running and connected, location changes are detected
// within 30 seconds of connecting to a new network.
// ------------------------------
router.get("/api/dashboard-data", requireLogin, (req, res) => {
    try {
 
        // ✅ Run location detection on every poll
        // This is the key — the browser polls every 30 seconds
        // even with the tab hidden, so this fires automatically
        // when the laptop connects to a new network
        const detectedLocation = detectLocationFromRequest(req);
 
        if (detectedLocation) {
            smartAutoUpdate(req.session.user.id, detectedLocation, req.session);
        }
 
        // Return fresh user data AFTER the auto-update
        const users = User.getAllWithLatestStatus(req.session.user.id);
 
        const data = users.map(u => ({
            id:            u.id,
            status_id:     u.status_id    || null,
            status_name:   u.status_name  || "Unspecified",
            status_color:  u.status_color || "black",
            location_name: u.location_name || "Unspecified",
            returning_at:  u.returning_at  || null,
            last_updated:  u.last_updated  || null,
            updated_by:    u.updated_by    || "System",
            comment:       u.comment       || ""
        }));
 
        res.json({ ok: true, users: data });
 
    } catch (err) {
        console.error("❌ dashboard-data error:", err.message);
        res.json({ ok: false, error: err.message });
    }
});

// ------------------------------
// LOCATION REFRESH ENDPOINT
// POST /api/location/refresh
// Performs the current user's automatic location/status update.
// Keeping this as an explicit write makes browser/network behaviour clear.
// ------------------------------
router.post("/api/location/refresh", requireLogin, (req, res) => {
    try {
        const detectedLocation = detectLocationFromRequest(req);

        if (!detectedLocation) {
            return res.json({
                ok: true,
                changed: false,
                reason: "no_location_detected"
            });
        }

        const result = smartAutoUpdate(req.session.user.id, detectedLocation, req.session);

        return res.json({
            ok: true,
            detectedLocationId: detectedLocation.id,
            detectedLocationName: detectedLocation.name,
            ...result
        });
    } catch (err) {
        console.error("❌ location-refresh error:", err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
});
 
// ------------------------------
// DASHBOARD PAGE
// ------------------------------
router.get("/dashboard", requireLogin, (req, res) => {
 
    try {
 
        const departments = Department.getAll();
        const statuses    = Status.getAll();
        const locations   = Location.getAll();
 
        // Load profile photos
        const photos   = Profile.getAllPhotos();
        const photoMap = {};
        for (const p of photos) {
            photoMap[p.user_id] = p.photo_path;
        }
 
        // Auto-detect location from IP
        const detectedLocation = detectLocationFromRequest(req);
 
        // Run smart auto-update if location detected
        if (detectedLocation) {
            smartAutoUpdate(req.session.user.id, detectedLocation, req.session);
        }
 
        // Load users AFTER auto-update so board is fresh
        const users = User.getAllWithLatestStatus(req.session.user.id);
 
        // Default department
        let defaultDeptId = null;
        const rows = db.prepare(
            `SELECT dept_id FROM user_departments WHERE user_id = ?`
        ).all(req.session.user.id);
 
        if (rows && rows.length === 1) {
            defaultDeptId = rows[0].dept_id;
        }
 
        res.render("dashboard", {
            user: req.session.user,
            departments:          departments || [],
            statuses:             statuses    || [],
            locations:            locations   || [],
            users:                users       || [],
            photoMap,
            defaultDeptId,
            detectedLocationId:   detectedLocation ? detectedLocation.id   : null,
            detectedLocationName: detectedLocation ? detectedLocation.name : null,
            query: req.query
        });
 
    } catch (err) {
        console.error("Dashboard load error:", err);
        res.send("DB Error loading dashboard");
    }
});
 
module.exports = router;