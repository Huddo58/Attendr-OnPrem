const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🔧 Fixing user_departments table…");

// 1. Create temp backup table (only if exists)
db.run(`DROP TABLE IF EXISTS user_departments_old;`);
db.run(`ALTER TABLE user_departments RENAME TO user_departments_old;`, (err) => {
    if (err) {
        console.log("No existing table to rename — creating fresh.");
    }

    // 2. Create correct table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_departments (
            user_id INTEGER,
            dept_id INTEGER
        );
    `, (err) => {
        if (err) return console.log("❌ Error creating pivot:", err);

        console.log("✅ Created fresh user_departments table");

        // 3. Copy any old data if exists
        db.run(`
            INSERT INTO user_departments (user_id)
            SELECT user_id FROM user_departments_old;
        `, (err) => {
            if (!err) console.log("📥 Migrated existing user references (dept_id set empty)");
            else console.log("ℹ️ No old rows copied (probably no old table)");

            // 4. Drop backup
            db.run(`DROP TABLE IF EXISTS user_departments_old;`, () => {
                console.log("🧹 Cleanup done!");
            });
        });
    });
});
