// tools/add-password-reset-flag.js
const dbLayer = require("../models/db");
const db = dbLayer.db;

console.log("🛠 Adding must_reset_password column (if missing)...");

db.run(
    `
    ALTER TABLE users
    ADD COLUMN must_reset_password INTEGER DEFAULT 0
    `,
    (err) => {
        if (err) {
            if (err.message.includes("duplicate column")) {
                console.log("ℹ️ Column already exists – nothing to do");
            } else {
                console.error("❌ Failed to add column:", err.message);
                process.exit(1);
            }
        } else {
            console.log("✅ Column added successfully");
        }

        process.exit(0);
    }
);
