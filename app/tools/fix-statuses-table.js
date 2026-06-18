const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.serialize(() => {
    console.log("Adding missing columns to statuses table...");

    db.run("ALTER TABLE statuses ADD COLUMN sort_order INTEGER DEFAULT 0", (err) => {
        if (err) console.log("sort_order already exists or error:", err.message);
        else console.log("Added sort_order");
    });

    db.run("ALTER TABLE statuses ADD COLUMN is_active INTEGER DEFAULT 1", (err) => {
        if (err) console.log("is_active already exists or error:", err.message);
        else console.log("Added is_active");
    });
});

db.close();
