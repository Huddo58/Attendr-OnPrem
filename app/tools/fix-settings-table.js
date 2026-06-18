const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🔧 Fixing settings table schema...");

db.serialize(() => {

    // Check existing structure
    db.all(`PRAGMA table_info(settings);`, (err, rows) => {
        if (err) {
            console.error("❌ Error reading settings table:", err);
            process.exit(1);
        }

        const hasKeyColumn = rows.some(r => r.name === "key");

        if (rows.length === 0 || !hasKeyColumn) {
            console.log("⚠️ Existing settings table is invalid. Recreating...");

            db.run(`DROP TABLE IF EXISTS settings`, err => {
                if (err) {
                    console.error("❌ Failed to drop settings table:", err);
                    process.exit(1);
                }

                db.run(`
                    CREATE TABLE settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                `, err => {
                    if (err) {
                        console.error("❌ Failed to create settings table:", err);
                        process.exit(1);
                    }

                    console.log("✅ Settings table recreated successfully");
                    process.exit(0);
                });
            });

        } else {
            console.log("✅ Settings table schema already correct. No action needed.");
            process.exit(0);
        }
    });

});
