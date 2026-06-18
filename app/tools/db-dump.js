// tools/db-dump.js
const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🔍 Dumping full DB schema + data...\n");

// Dump schema
db.all(
    "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index','view') ORDER BY name;",
    [],
    (err, rows) => {
        if (err) return console.error("Schema error:", err);

        console.log("=== DATABASE SCHEMA ===");
        rows.forEach(r => {
            console.log(`\n--- ${r.name} ---`);
            console.log(r.sql);
        });

        console.log("\n=== TABLE CONTENTS ===");

        // Dump all table contents
        db.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            [],
            async (err2, tables) => {
                if (err2) return console.error("Table list error:", err2);

                for (const t of tables) {
                    await new Promise(res => {
                        db.all(`SELECT * FROM ${t.name}`, [], (err3, data) => {
                            if (err3) {
                                console.log(`\n--- ${t.name} ---`);
                                console.log("Error reading table:", err3);
                            } else {
                                console.log(`\n--- ${t.name} ---`);
                                console.table(data);
                            }
                            res();
                        });
                    });
                }

                console.log("\n✅ DONE");
                process.exit(0);
            }
        );
    }
);
