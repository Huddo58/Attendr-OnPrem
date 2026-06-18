// tools/add-returning-comment.js

const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🔧 Running migration: add returning_at + comment");

db.serialize(() => {
    db.run(`ALTER TABLE staff_status ADD COLUMN returning_at TEXT`, err => {
        if (err && !err.message.includes("duplicate column")) {
            console.error("❌ returning_at error:", err.message);
        } else {
            console.log("✅ returning_at column OK");
        }
    });

    db.run(`ALTER TABLE staff_status ADD COLUMN comment TEXT`, err => {
        if (err && !err.message.includes("duplicate column")) {
            console.error("❌ comment error:", err.message);
        } else {
            console.log("✅ comment column OK");
        }
    });
});

