// tools/db-inspect-sqlite.js

const dbModule = require("../models/db");
const db = dbModule.db;

console.log("🧪 Inspecting SQLite database…");

// List all tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) return console.error("Error fetching tables:", err);

    console.log("\n📌 Tables found:");
    console.table(tables);

    console.log("\n📌 Inspecting table structures...\n");

    tables.forEach(t => {
        const table = t.name;

        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
            if (err) return console.error(`Error describing table ${table}:`, err);

            console.log(`\n🔎 TABLE: ${table}`);
            console.table(rows);
        });
    });
});
