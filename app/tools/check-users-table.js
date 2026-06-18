// tools/check-users-table.js
const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🔍 Checking users table structure...\n");

db.all("PRAGMA table_info(users);", [], (err, rows) => {
    if (err) {
        console.error("❌ Error reading users table:", err);
        process.exit(1);
    }

    console.table(rows);

    const hasResetFlag = rows.some(r => r.name === "must_reset_password");

    if (hasResetFlag) {
        console.log("\n✅ must_reset_password column EXISTS");
    } else {
        console.log("\n❌ must_reset_password column MISSING");
    }

    process.exit(0);
});
