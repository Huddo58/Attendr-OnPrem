// models/userModel.js
const dbLayer = require("./db");
const bcrypt  = require("bcryptjs");
const db = dbLayer.db;

// ---------------------------------------------------------------
// Default password applied to LDAP users created by AD sync.
// They authenticate via bcrypt (not LDAP bind) and are forced to
// reset on first login (must_reset_password = 1).
//
// NOTE: spelling is "Attenddr123!" (double-d), taken verbatim from
// the request. This MUST match whatever you set the existing patched
// ldap users to in your direct DB update, or those users and future
// synced users will have different default passwords. Override via
// the AD_DEFAULT_PASSWORD env var if you'd rather not hardcode it.
// ---------------------------------------------------------------
const DEFAULT_AD_PASSWORD = process.env.AD_DEFAULT_PASSWORD || "Attendr123!";

module.exports = {
 
    // ---------------------------------------
    // GET USER BY EMAIL (LOGIN)
    // ---------------------------------------
    getByEmail(email) {
        return db.prepare(
            `SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1 LIMIT 1`
        ).get(email);
    },
 
    // ---------------------------------------
    // GET ALL USERS (ADMIN)
    // ---------------------------------------
    getAll() {
        return db.prepare(
            `SELECT * FROM users WHERE is_active = 1 ORDER BY name ASC`
        ).all();
    },
 
    // ---------------------------------------
    // USERS + DEPARTMENTS (ADMIN)
    // ---------------------------------------
    getAllWithDepartments() {
        const sql = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.role,
                u.must_reset_password,
                u.auth_source,
                GROUP_CONCAT(d.name, ', ') AS departments
            FROM users u
            LEFT JOIN user_departments ud ON ud.user_id = u.id
            LEFT JOIN departments d ON d.id = ud.dept_id
            WHERE u.is_system = 0
              AND u.is_active = 1
            GROUP BY u.id
            ORDER BY u.name ASC;
        `;
        return db.prepare(sql).all();
    },
 
    // ---------------------------------------
    // USERS + LATEST STATUS (DASHBOARD / KIOSK)
    // ---------------------------------------
    getAllWithLatestStatus(currentUserId) {
        const sql = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.role,
                u.must_reset_password,
                u.auth_source,
 
                ss.status_id,
                ss.location_id,
                ss.timestamp AS last_updated,
                ss.returning_at,
                ss.comment,
 
                st.name AS status_name,
                st.color AS status_color,
                loc.name AS location_name,
 
                (
                    SELECT GROUP_CONCAT(d.name, ', ')
                    FROM user_departments ud
                    LEFT JOIN departments d ON d.id = ud.dept_id
                    WHERE ud.user_id = u.id
                ) AS departments,

                (
                    SELECT GROUP_CONCAT(ud.dept_id, ',')
                    FROM user_departments ud
                    WHERE ud.user_id = u.id
                ) AS department_ids,
 
                CASE
                    WHEN ss.comment = 'Manual reset' THEN 'System (manual reset)'
                    WHEN ss.comment = 'Daily automatic reset' THEN 'System'
                    WHEN ss.comment = 'System location update' THEN 'System'
                    ELSE (
                        SELECT l.user_name
                        FROM logs l
                        WHERE l.entity = 'user'
                          AND l.entity_id = u.id
                          AND l.action LIKE 'changed status%'
                        ORDER BY l.timestamp DESC
                        LIMIT 1
                    )
                END AS updated_by
 
            FROM users u
            LEFT JOIN staff_status ss ON ss.id = (
                SELECT id
                FROM staff_status
                WHERE user_id = u.id
                ORDER BY datetime(timestamp) DESC, id DESC
                LIMIT 1
            )
            LEFT JOIN statuses st ON st.id = ss.status_id
            LEFT JOIN locations loc ON loc.id = ss.location_id
            WHERE u.is_system = 0
              AND u.is_active = 1
            ORDER BY 
                CASE WHEN u.id = ? THEN 0 ELSE 1 END,
                u.name ASC;
        `;
        return db.prepare(sql).all(currentUserId);
    },
 
    // ---------------------------------------
    // CREATE USER (ADMIN)
    // ---------------------------------------
    create(name, email, password, role, departmentIds) {
 
        const insertUser = db.prepare(`
            INSERT INTO users (name, email, password, role, must_reset_password, auth_source)
            VALUES (?, ?, ?, ?, 1, 'local')
        `);
 
        const result = insertUser.run(name, email, password, role);
        const userId = result.lastInsertRowid;
 
        if (departmentIds && departmentIds.length > 0) {
            const insertDept = db.prepare(
                "INSERT INTO user_departments (user_id, dept_id) VALUES (?, ?)"
            );
 
            for (const deptId of departmentIds) {
                insertDept.run(userId, deptId);
            }
        }
 
        return { id: userId };
    },
 
    // ---------------------------------------
    // ✅ CREATE USER FROM AD (auto-create on first AD login or sync)
    // auth_source: 'azure' or 'ldap'
    //
    //   - ldap  → user authenticates via bcrypt against a locally
    //             stored password. AD sync seeds the default password
    //             (DEFAULT_AD_PASSWORD) and must_reset_password = 1 so
    //             they set their own on first login.
    //   - azure → authenticates externally via Microsoft, never by
    //             local password, so we leave password NULL. Seeding a
    //             known local password here would be dead weight and
    //             needless attack surface.
    // ---------------------------------------
    createFromAD({ name, email, role, authSource, jobTitle, department, manager }) {
 
        // Auto-create department if it doesn't exist
        let deptId = null;
        if (department) {
            const existingDept = db.prepare(
                `SELECT id FROM departments WHERE LOWER(name) = LOWER(?)`
            ).get(department);
 
            if (existingDept) {
                deptId = existingDept.id;
            } else {
                const deptResult = db.prepare(
                    `INSERT INTO departments (name, code, description) VALUES (?, ?, ?)`
                ).run(department, department.substring(0, 4).toUpperCase(), "Auto-created from AD sync");
                deptId = deptResult.lastInsertRowid;
            }
        }
 
        // Decide local-auth fields based on auth source.
        //   azure → external auth, no local password, no forced reset
        //   ldap  → seed default password + force reset on first login
        let passwordHash    = null;
        let mustResetPassword = 0;

        if (authSource !== "azure") {
            passwordHash      = bcrypt.hashSync(DEFAULT_AD_PASSWORD, 10);
            mustResetPassword = 1;
        }

        // Create the user
        const result = db.prepare(`
            INSERT INTO users (name, email, password, role, must_reset_password, auth_source)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, email, passwordHash, role || "user", mustResetPassword, authSource);
 
        const userId = result.lastInsertRowid;
 
        // Assign to department if found/created
        if (deptId) {
            db.prepare(
                `INSERT INTO user_departments (user_id, dept_id) VALUES (?, ?)`
            ).run(userId, deptId);
        }
 
        // Store job title and manager in settings-style profile
        // (full profile model comes in the profiles feature — for now store as user metadata)
        if (jobTitle || manager) {
            try {
                db.prepare(`
                    INSERT OR IGNORE INTO user_profiles (user_id, job_title, manager)
                    VALUES (?, ?, ?)
                `).run(userId, jobTitle || null, manager || null);
            } catch {
                // user_profiles table may not exist yet — profiles feature installs it
            }
        }
 
        return { id: userId };
    },
 
    // ---------------------------------------
    // ✅ NEW: UPDATE AUTH SOURCE
    // Called when a local user successfully authenticates via AD
    // ---------------------------------------
    updateAuthSource(userId, authSource) {
        db.prepare(
            `UPDATE users SET auth_source = ? WHERE id = ?`
        ).run(authSource, userId);
    },
 
    // ---------------------------------------
    // ✅ NEW: FLAG USER FOR REVIEW
    // Called during AD sync when a user in Attenddr wasn't found in AD
    // ---------------------------------------
    flagForReview(userId, reason) {
 
        // Only flag if not already flagged and unresolved
        const existing = db.prepare(`
            SELECT id FROM ad_flagged_users
            WHERE user_id = ? AND resolved = 0
        `).get(userId);
 
        if (!existing) {
            db.prepare(`
                INSERT INTO ad_flagged_users (user_id, reason)
                VALUES (?, ?)
            `).run(userId, reason || "Not found in Active Directory during sync");
        }
    },
 
    // ---------------------------------------
    // ✅ NEW: GET ALL FLAGGED USERS (ADMIN REVIEW)
    // ---------------------------------------
    getADFlagged() {
        return db.prepare(`
            SELECT
                af.id AS flag_id,
                af.user_id,
                af.flagged_at,
                af.reason,
                u.name,
                u.email,
                u.role,
                u.auth_source
            FROM ad_flagged_users af
            JOIN users u ON u.id = af.user_id
            WHERE af.resolved = 0
            ORDER BY af.flagged_at DESC
        `).all();
    },
 
    // ---------------------------------------
    // ✅ NEW: RESOLVE A FLAG (ADMIN DISMISSED IT)
    // ---------------------------------------
    resolveADFlag(flagId) {
        db.prepare(
            `UPDATE ad_flagged_users SET resolved = 1 WHERE id = ?`
        ).run(flagId);
    },
 
    // ---------------------------------------
    // HARD DELETE USER (ADMIN)
    // ---------------------------------------
    delete(id) {
        db.prepare(`DELETE FROM user_departments WHERE user_id = ?`).run(id);
        db.prepare(`DELETE FROM staff_status WHERE user_id = ?`).run(id);
        db.prepare(`DELETE FROM ad_flagged_users WHERE user_id = ?`).run(id);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    },
 
    // ---------------------------------------
    // RESET PASSWORD (ADMIN)
    // ---------------------------------------
    resetPassword(id, hashedPassword) {
        db.prepare(`
            UPDATE users
            SET password = ?, must_reset_password = 1
            WHERE id = ?
        `).run(hashedPassword, id);
    },
 
    // ---------------------------------------
    // FORCE PASSWORD RESET FLAG
    // ---------------------------------------
    setMustResetPassword(userId, flag) {
        db.prepare(`
            UPDATE users
            SET must_reset_password = ?
            WHERE id = ?
        `).run(flag, userId);
    },
 
    // ---------------------------------------
    // UPDATE PASSWORD + CLEAR RESET FLAG
    // ---------------------------------------
    updatePasswordAndClearReset(userId, hashedPassword) {
        db.prepare(`
            UPDATE users
            SET password = ?, must_reset_password = 0
            WHERE id = ?
        `).run(hashedPassword, userId);
    },
 
    // ---------------------------------------
    // CLEAR RESET FLAG ONLY
    // ---------------------------------------
    clearMustResetPassword(userId) {
        db.prepare(`
            UPDATE users
            SET must_reset_password = 0
            WHERE id = ?
        `).run(userId);
    },
 
    // ---------------------------------------
    // UPDATE USER DETAILS (ADMIN)
    // ---------------------------------------
    update(id, name, email, role, departmentIds) {
 
        db.prepare(
            `UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?`
        ).run(name, email, role, id);
 
        db.prepare(
            `DELETE FROM user_departments WHERE user_id = ?`
        ).run(id);
 
        if (departmentIds && departmentIds.length > 0) {
            const insertDept = db.prepare(
                "INSERT INTO user_departments (user_id, dept_id) VALUES (?, ?)"
            );
 
            for (const did of departmentIds) {
                insertDept.run(id, did);
            }
        }
    },
 
    // ---------------------------------------
    // DEACTIVATE USER (soft delete)
    // ---------------------------------------
    deactivate(id) {
        db.prepare(
            `UPDATE users SET is_active = 0 WHERE id = ?`
        ).run(id);
    }
};