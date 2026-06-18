// models/settingsModel.js
const dbLayer = require("./db");
const db = dbLayer.db;
 
module.exports = {
 
    // ---------------------------------------
    // GET SINGLE SETTING
    // ---------------------------------------
    get(key) {
        const row = db.prepare(
            "SELECT value FROM settings WHERE key = ?"
        ).get(key);
 
        return row ? row.value : null;
    },
 
    // ---------------------------------------
    // SET / UPSERT SETTING
    // ---------------------------------------
    set(key, value) {
        db.prepare(`
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(key, value);
    },
 
    // ---------------------------------------
    // GET ALL SETTINGS
    // ---------------------------------------
    getAll() {
        const rows = db.prepare(
            "SELECT key, value FROM settings"
        ).all();
 
        const obj = {};
        for (const r of rows) {
            obj[r.key] = r.value;
        }
 
        return obj;
    },
 
    // ---------------------------------------
    // ✅ NEW: GET MULTIPLE SETTINGS BY PREFIX
    // Fetches all settings whose key starts with a given prefix
    // and returns them as a plain object.
    //
    // Example:
    //   getByPrefix('ad_azure_') returns:
    //   {
    //     ad_azure_enabled: '1',
    //     ad_azure_tenant_id: 'xxx',
    //     ad_azure_client_id: 'yyy',
    //     ...
    //   }
    //
    // Used by azureAuth.js and ldapAuth.js to load their
    // config in one call instead of multiple individual gets.
    // ---------------------------------------
    getByPrefix(prefix) {
        const rows = db.prepare(
            "SELECT key, value FROM settings WHERE key LIKE ?"
        ).all(`${prefix}%`);
 
        const obj = {};
        for (const r of rows) {
            obj[r.key] = r.value;
        }
 
        return obj;
    },
 
    // ---------------------------------------
    // ✅ NEW: SET MULTIPLE SETTINGS AT ONCE
    // Accepts a plain object of key/value pairs and
    // upserts each one. Used by the integrations
    // settings form to save all AD config in one call.
    //
    // Example:
    //   setMultiple({
    //     ad_azure_enabled: '1',
    //     ad_azure_tenant_id: 'xxx'
    //   })
    // ---------------------------------------
    setMultiple(obj) {
        const stmt = db.prepare(`
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
 
        const saveMany = db.transaction((entries) => {
            for (const [key, value] of entries) {
                stmt.run(key, value);
            }
        });
 
        saveMany(Object.entries(obj));
    }
};