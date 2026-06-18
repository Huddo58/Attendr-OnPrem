const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.run("ALTER TABLE locations ADD COLUMN address TEXT", (err) => {
    if (err) console.log("Already exists or error:", err.message);
    else console.log("Address column added.");
});

db.close();
