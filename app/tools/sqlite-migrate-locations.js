const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.serialize(() => {
    console.log("🔍 Checking existing schema…");

    db.all("PRAGMA table_info(locations);", (err, rows) => {
        if (err) return console.error(err);

        const cols = rows.map(r => r.name);
        console.log("📋 Current columns:", cols);

        // If already correct, stop.
        if (cols.includes("name") && cols.includes("code") && cols.includes("address")) {
            console.log("✅ Locations table already correct.");
            return;
        }

        console.log("⚠️ Migrating locations table…");

        db.run("ALTER TABLE locations RENAME TO locations_old;", (err) => {
            if (err) return console.error("Rename error:", err);
        });

        db.run(`
            CREATE TABLE locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                code TEXT,
                address TEXT
            );
        `, (err) => {
            if (err) return console.error("Create new table error:", err);
        });

        db.run(`
            INSERT INTO locations (name, code, address)
            SELECT 
                name,
                '' as code,
                '' as address
            FROM locations_old;
        `, (err) => {
            if (err) return console.error("Copy rows error:", err);
        });

        db.run("DROP TABLE locations_old;", (err) => {
            if (err) return console.error("Drop old table error:", err);
            console.log("✅ Migration complete!");
        });
    });
});
