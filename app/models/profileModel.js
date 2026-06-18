// models/profileModel.js
const dbLayer = require("./db");
const db = dbLayer.db;
 
module.exports = {
 
    // ---------------------------------------
    // GET PROFILE BY USER ID
    // ---------------------------------------
    getByUserId(userId) {
        return db.prepare(`
            SELECT * FROM user_profiles WHERE user_id = ?
        `).get(userId) || null;
    },
 
    // ---------------------------------------
    // GET FULL PROFILE WITH USER + PREFERENCES
    // ✅ UPDATED: includes default_location_id,
    // home_status_id, away_status_id and their
    // names for display in the profile page
    // ---------------------------------------
    getFullProfile(userId) {
        return db.prepare(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                u.auth_source,
                u.must_reset_password,
 
                p.photo_path,
                p.employee_id,
                p.job_title,
                p.phone,
                p.manager,
                p.updated_at,
 
                p.default_location_id,
                p.home_status_id,
                p.away_status_id,
 
                dl.name  AS default_location_name,
                hs.name  AS home_status_name,
                hs.color AS home_status_color,
                aws.name  AS away_status_name,
                aws.color AS away_status_color,
 
                (
                    SELECT GROUP_CONCAT(d.name, ', ')
                    FROM user_departments ud
                    LEFT JOIN departments d ON d.id = ud.dept_id
                    WHERE ud.user_id = u.id
                ) AS departments
 
            FROM users u
            LEFT JOIN user_profiles p   ON p.user_id        = u.id
            LEFT JOIN locations dl      ON dl.id             = p.default_location_id
            LEFT JOIN statuses  hs      ON hs.id             = p.home_status_id
            LEFT JOIN statuses  aws     ON aws.id            = p.away_status_id
            WHERE u.id = ?
        `).get(userId) || null;
    },
 
    // ---------------------------------------
    // GET ALL PHOTOS
    // Used by dashboard to build avatar map
    // ---------------------------------------
    getAllPhotos() {
        return db.prepare(`
            SELECT user_id, photo_path
            FROM user_profiles
            WHERE photo_path IS NOT NULL AND photo_path != ''
        `).all();
    },
 
    // ---------------------------------------
    // GET STATUS PREFERENCES FOR A USER
    // Called by the auto-status logic on
    // dashboard load — lightweight query
    // ---------------------------------------
    getStatusPreferences(userId) {
        return db.prepare(`
            SELECT
                default_location_id,
                home_status_id,
                away_status_id
            FROM user_profiles
            WHERE user_id = ?
        `).get(userId) || null;
    },
 
    // ---------------------------------------
    // UPSERT PROFILE
    // ---------------------------------------
    upsert(userId, fields) {
        const existing = this.getByUserId(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO user_profiles (
                    user_id, photo_path, employee_id,
                    job_title, phone, manager,
                    default_location_id, home_status_id, away_status_id,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                userId,
                fields.photo_path          ?? null,
                fields.employee_id         ?? null,
                fields.job_title           ?? null,
                fields.phone               ?? null,
                fields.manager             ?? null,
                fields.default_location_id ?? null,
                fields.home_status_id      ?? null,
                fields.away_status_id      ?? null
            );
        } else {
            db.prepare(`
                UPDATE user_profiles SET
                    photo_path          = COALESCE(?, photo_path),
                    employee_id         = COALESCE(?, employee_id),
                    job_title           = COALESCE(?, job_title),
                    phone               = COALESCE(?, phone),
                    manager             = COALESCE(?, manager),
                    default_location_id = COALESCE(?, default_location_id),
                    home_status_id      = COALESCE(?, home_status_id),
                    away_status_id      = COALESCE(?, away_status_id),
                    updated_at          = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(
                fields.photo_path          ?? null,
                fields.employee_id         ?? null,
                fields.job_title           ?? null,
                fields.phone               ?? null,
                fields.manager             ?? null,
                fields.default_location_id ?? null,
                fields.home_status_id      ?? null,
                fields.away_status_id      ?? null,
                userId
            );
        }
    },
 
    // ---------------------------------------
    // UPDATE PHOTO ONLY
    // ---------------------------------------
    updatePhoto(userId, photoPath) {
        const existing = this.getByUserId(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO user_profiles (user_id, photo_path, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `).run(userId, photoPath);
        } else {
            db.prepare(`
                UPDATE user_profiles
                SET photo_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(photoPath, userId);
        }
    },
 
    // ---------------------------------------
    // UPDATE ADMIN FIELDS
    // employee_id, job_title, manager
    // ---------------------------------------
    updateAdminFields(userId, { employeeId, jobTitle, manager }) {
        const existing = this.getByUserId(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO user_profiles (
                    user_id, employee_id, job_title, manager, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(userId, employeeId || null, jobTitle || null, manager || null);
        } else {
            db.prepare(`
                UPDATE user_profiles SET
                    employee_id = ?,
                    job_title   = ?,
                    manager     = ?,
                    updated_at  = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(employeeId || null, jobTitle || null, manager || null, userId);
        }
    },
 
    // ---------------------------------------
    // UPDATE USER FIELDS
    // phone — user editable
    // ---------------------------------------
    updateUserFields(userId, { phone }) {
        const existing = this.getByUserId(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO user_profiles (user_id, phone, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `).run(userId, phone || null);
        } else {
            db.prepare(`
                UPDATE user_profiles SET
                    phone      = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(phone || null, userId);
        }
    },
 
    // ---------------------------------------
    // ✅ NEW: UPDATE STATUS PREFERENCES
    // default_location_id, home_status_id, away_status_id
    // Can be set by the user themselves or by admin
    // via the Add User popup
    // ---------------------------------------
    updateStatusPreferences(userId, { defaultLocationId, homeStatusId, awayStatusId }) {
        const existing = this.getByUserId(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO user_profiles (
                    user_id,
                    default_location_id,
                    home_status_id,
                    away_status_id,
                    updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                userId,
                defaultLocationId || null,
                homeStatusId      || null,
                awayStatusId      || null
            );
        } else {
            db.prepare(`
                UPDATE user_profiles SET
                    default_location_id = ?,
                    home_status_id      = ?,
                    away_status_id      = ?,
                    updated_at          = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(
                defaultLocationId || null,
                homeStatusId      || null,
                awayStatusId      || null,
                userId
            );
        }
    },
 
    // ---------------------------------------
    // DELETE PROFILE
    // Called when a user is deleted
    // ---------------------------------------
    deleteByUserId(userId) {
        db.prepare(
            `DELETE FROM user_profiles WHERE user_id = ?`
        ).run(userId);
    }
};