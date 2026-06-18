// models/init.js
const crypto = require("crypto");
const dbLayer = require("./db");
const db = dbLayer.db;

function initDatabase() {
    console.log("Initialising Attenddr database...");

    if (dbLayer.type !== "sqlite") return;

    try {

        // ------------------------
        // SQLITE HARDENING
        // ------------------------
        db.pragma("journal_mode = WAL");
        db.pragma("busy_timeout = 5000");
        db.pragma("synchronous = NORMAL");
        db.pragma("foreign_keys = ON");

        // ------------------------
        // USERS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password TEXT,
                role TEXT,
                name TEXT,
                must_reset_password INTEGER DEFAULT 0,
                is_system INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                auth_source TEXT DEFAULT 'local'
            );
        `);

        try { db.exec(`ALTER TABLE users ADD COLUMN must_reset_password INTEGER DEFAULT 0`); } catch {}
        try { db.exec(`ALTER TABLE users ADD COLUMN is_system INTEGER DEFAULT 0`); } catch {}
        try { db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`); } catch {}
        try { db.exec(`ALTER TABLE users ADD COLUMN auth_source TEXT DEFAULT 'local'`); } catch {}

        // ------------------------
        // DEPARTMENTS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                code TEXT,
                description TEXT
            );
        `);

        // ------------------------
        // LOGS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                action TEXT NOT NULL,
                entity TEXT NOT NULL,
                entity_id INTEGER,
                target_name TEXT,
                user_id INTEGER,
                user_name TEXT,
                user_role TEXT
            );
        `);

        // ------------------------
        // USER ↔ DEPARTMENTS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_departments (
                user_id INTEGER,
                dept_id INTEGER
            );
        `);

        // ------------------------
        // LOCATIONS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                code TEXT,
                address TEXT,
                cidr TEXT
            );
        `);

        try { db.exec(`ALTER TABLE locations ADD COLUMN cidr TEXT`); } catch {}

        // ------------------------
        // STATUSES
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS statuses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                exclude_from_reset INTEGER DEFAULT 0
            );
        `);

        const existingStatus = db.prepare(
            `SELECT id FROM statuses WHERE LOWER(name)=LOWER(?)`
        ).get("Out of Office");

        if (!existingStatus) {
            db.prepare(`
                INSERT INTO statuses (name, color, sort_order, is_active, exclude_from_reset)
                VALUES (?, ?, 0, 1, 0)
            `).run("Out of Office", "black");
        }

        // ------------------------
        // STAFF STATUS HISTORY
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS staff_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                status_id INTEGER NOT NULL,
                location_id INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                returning_at TEXT,
                comment TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (status_id) REFERENCES statuses(id),
                FOREIGN KEY (location_id) REFERENCES locations(id)
            );
        `);

        // ------------------------
        // SETTINGS
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        db.exec(`INSERT OR IGNORE INTO settings VALUES ('setup_complete','0')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('daily_reset_enabled','1')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('last_daily_reset_at','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('last_daily_reset_date','')`);

        // Azure AD settings
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_azure_enabled','0')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_azure_tenant_id','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_azure_client_id','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_azure_client_secret','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_azure_redirect_uri','')`);

        // LDAP settings
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_enabled','0')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_url','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_port','389')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_base_dn','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_service_dn','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_service_password','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_user_attribute','userPrincipalName')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_sync_ou','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_sync_mode','ou')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_ldap_sync_groups','')`);

        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_default_role','user')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_last_sync_at','')`);
        db.exec(`INSERT OR IGNORE INTO settings VALUES ('ad_last_sync_result','')`);

        // AD flagged users table
        db.exec(`
            CREATE TABLE IF NOT EXISTS ad_flagged_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                resolved INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // ------------------------
        // USER PROFILES
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                photo_path TEXT,
                employee_id TEXT,
                job_title TEXT,
                phone TEXT,
                manager TEXT,
                default_location_id INTEGER,
                home_status_id INTEGER,
                away_status_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (default_location_id) REFERENCES locations(id),
                FOREIGN KEY (home_status_id) REFERENCES statuses(id),
                FOREIGN KEY (away_status_id) REFERENCES statuses(id)
            );
        `);

        try { db.exec(`ALTER TABLE user_profiles ADD COLUMN default_location_id INTEGER`); } catch {}
        try { db.exec(`ALTER TABLE user_profiles ADD COLUMN home_status_id INTEGER`); } catch {}
        try { db.exec(`ALTER TABLE user_profiles ADD COLUMN away_status_id INTEGER`); } catch {}

        // ------------------------
        // INSTANCE ID
        // ------------------------
        const instanceRow = db.prepare(
            `SELECT value FROM settings WHERE key='instance_id'`
        ).get();

        if (!instanceRow || !instanceRow.value) {
            const instanceId = crypto.randomUUID();
            db.prepare(
                `INSERT OR REPLACE INTO settings (key,value) VALUES ('instance_id',?)`
            ).run(instanceId);
        }

        // ------------------------
        // LICENSING
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_hash TEXT,
                license_hash TEXT,
                license_key TEXT,
                tier TEXT NOT NULL,
                max_users INTEGER,
                issued_at TEXT,
                activated_at TEXT,
                expires_at TEXT,
                status TEXT NOT NULL,
                instance_id TEXT
            );
        `);

        const trialRow = db.prepare(
            `SELECT id FROM licenses WHERE tier='trial' LIMIT 1`
        ).get();

        if (!trialRow) {
            const now     = new Date();
            const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            db.prepare(`
                INSERT INTO licenses (
                    tier, max_users, issued_at, activated_at,
                    expires_at, status, instance_id
                ) VALUES (?, ?, ?, ?, ?, 'active', NULL)
            `).run(
                "trial", 50,
                now.toISOString(), now.toISOString(),
                expires.toISOString()
            );
        }

        // ------------------------
        // BRANDING
        //
        // The branding_settings table has evolved over time:
        //
        // v1 schema: primary_color TEXT NOT NULL, accent_color TEXT NOT NULL
        // v2 schema: + brand_color TEXT, + logo_path TEXT
        //
        // We must support all old databases being plugged in.
        // Strategy:
        //   1. CREATE TABLE IF NOT EXISTS with the full v2 schema
        //      (only runs on brand new installs)
        //   2. ALTER TABLE to add new columns — silently ignored if
        //      they already exist (new installs or already migrated)
        //   3. UPDATE to set brand_color from primary_color on old
        //      installs that have primary_color but no brand_color yet
        //   4. INSERT OR IGNORE to seed the default row on new installs
        // ------------------------
        db.exec(`
            CREATE TABLE IF NOT EXISTS branding_settings (
                id            INTEGER PRIMARY KEY,
                primary_color TEXT NOT NULL DEFAULT '#0d2b4d',
                accent_color  TEXT NOT NULL DEFAULT '#005DFF',
                brand_color   TEXT,
                logo_path     TEXT
            );
        `);

        // Add new columns to existing installs — safe, ignored if present
        try { db.exec(`ALTER TABLE branding_settings ADD COLUMN brand_color TEXT`); } catch {}
        try { db.exec(`ALTER TABLE branding_settings ADD COLUMN logo_path TEXT`); } catch {}

        // Migrate old installs: copy primary_color into brand_color
        // where brand_color is not yet set
        db.exec(`
            UPDATE branding_settings
            SET brand_color = primary_color
            WHERE brand_color IS NULL AND primary_color IS NOT NULL;
        `);

        // Seed default row for brand new installs
        // Uses all columns including old ones so NOT NULL is never violated
        db.exec(`
            INSERT OR IGNORE INTO branding_settings
                (id, primary_color, accent_color, brand_color, logo_path)
            VALUES
                (1, '#0d2b4d', '#005DFF', '#0d2b4d', NULL);
        `);

        console.log("SQLite schema initialised");

    } catch (err) {
        console.error("Schema initialisation failed:", err.message);
        process.exit(1);
    }
}

module.exports = initDatabase;
