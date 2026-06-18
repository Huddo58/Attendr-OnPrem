console.log("Better-sqlite3 resolved path:", require.resolve("better-sqlite3"));
console.log("🧪 DB FILE VERSION MARKER: A5");

const config = require("../config");

let dbLayer = {
    type: null,
    db: null
};

// --------------------------------------------------
// ON-PREM → SQLITE (better-sqlite3)
// --------------------------------------------------
if (config.mode === "onprem") {

    const Database = require("better-sqlite3");

    // 🔒 CRITICAL: Always log the exact DB file being used
    console.log("🗄️ SQLite DB file path:", config.sqlite.filename);

    try {

        const db = new Database(config.sqlite.filename);

        console.log("💾 SQLite database loaded (on-prem)");

        // 🔒 Startup pragmas
        db.pragma("journal_mode = WAL");
        db.pragma("synchronous = NORMAL");
        db.pragma("busy_timeout = 5000");
        db.pragma("foreign_keys = ON");

        dbLayer.type = "sqlite";
        dbLayer.db = db;

    } catch (err) {
        console.error("❌ SQLite connection error:", err.message);
        process.exit(1);
    }
}

// --------------------------------------------------
// SAAS → POSTGRES
// --------------------------------------------------
else {
    const { Pool } = require("pg");
    const pool = new Pool(config.postgres);

    console.log("🌐 PostgreSQL database pool created (SaaS)");

    dbLayer.type = "postgres";
    dbLayer.db = pool;
}

module.exports = dbLayer;