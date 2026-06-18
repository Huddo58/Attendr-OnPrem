
// models/brandingModel.js
// Handles branding settings — brand colour and custom logo.
//
// brand_color — single hex colour used as the base for the gradient
//               across the entire app. Default: Attenddr navy #0d2b4d.
// logo_path   — path to an uploaded custom logo, or null to use
//               the default Attenddr logo.
//
// The table always has primary_color and accent_color columns
// (kept for backwards compatibility with old databases).
// All writes include those columns so NOT NULL is never violated.
 
const dbLayer = require("./db");
const db      = dbLayer.db;
 
const DEFAULT_COLOR        = "#0d2b4d";
const DEFAULT_ACCENT       = "#005DFF";
 
module.exports = {
 
    // ---------------------------------------
    // GET BRANDING SETTINGS
    // Always returns an object — never null.
    // ---------------------------------------
    getSettings() {
        try {
            const row = db.prepare(
                `SELECT * FROM branding_settings WHERE id = 1 LIMIT 1`
            ).get();
 
            if (row) return row;
        } catch {}
 
        return {
            id:            1,
            primary_color: DEFAULT_COLOR,
            accent_color:  DEFAULT_ACCENT,
            brand_color:   DEFAULT_COLOR,
            logo_path:     null
        };
    },
 
    // ---------------------------------------
    // UPDATE BRAND COLOUR
    // Includes old columns in upsert so NOT
    // NULL constraint is never violated on
    // databases with the old schema.
    // ---------------------------------------
    updateBrandColor(color) {
        const safe = color || DEFAULT_COLOR;
        db.prepare(`
            INSERT INTO branding_settings
                (id, primary_color, accent_color, brand_color, logo_path)
            VALUES (1, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
                brand_color   = excluded.brand_color,
                primary_color = excluded.primary_color
        `).run(safe, DEFAULT_ACCENT, safe);
    },
 
    // ---------------------------------------
    // UPDATE LOGO PATH
    // ---------------------------------------
    updateLogo(logoPath) {
        const current = this.getSettings();
        const color   = current.brand_color || DEFAULT_COLOR;
        db.prepare(`
            INSERT INTO branding_settings
                (id, primary_color, accent_color, brand_color, logo_path)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                logo_path = excluded.logo_path
        `).run(color, DEFAULT_ACCENT, color, logoPath || null);
    },
 
    // ---------------------------------------
    // REMOVE LOGO
    // ---------------------------------------
    removeLogo() {
        const current = this.getSettings();
        const color   = current.brand_color || DEFAULT_COLOR;
        db.prepare(`
            INSERT INTO branding_settings
                (id, primary_color, accent_color, brand_color, logo_path)
            VALUES (1, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
                logo_path = NULL
        `).run(color, DEFAULT_ACCENT, color);
    },
 
    // ---------------------------------------
    // RESET TO DEFAULTS
    // ---------------------------------------
    resetDefaults() {
        db.prepare(`
            INSERT INTO branding_settings
                (id, primary_color, accent_color, brand_color, logo_path)
            VALUES (1, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
                brand_color   = excluded.brand_color,
                primary_color = excluded.primary_color,
                logo_path     = NULL
        `).run(DEFAULT_COLOR, DEFAULT_ACCENT, DEFAULT_COLOR);
    }
};
 