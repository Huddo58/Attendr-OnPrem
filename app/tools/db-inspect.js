// tools/db-inspect.js
//
// Run:  node tools/db-inspect.js
//
// This will output all tables + all columns in your Attendr database.

const mysql = require("mysql2/promise");

(async () => {
    try {
        const db = await mysql.createConnection({
            host: "localhost",
            user: "root",        // <-- update if needed
            password: "",        // <-- update if needed
            database: "attendr"  // <-- update if needed
        });

        console.log("\n📌 Inspecting Attendr Database...\n");

        // 1. List all tables
        const [tables] = await db.execute("SHOW TABLES");
        console.log("🧩 Tables found:");
        console.log(tables);

        console.log("\n-----------------------------------------\n");

        // 2. For each table, print column definitions
        for (const tableObj of tables) {
            const tableName = Object.values(tableObj)[0];

            console.log(`🔍 TABLE: ${tableName}`);

            const [columns] = await db.execute(`SHOW COLUMNS FROM \`${tableName}\``);
            console.table(columns);

            console.log("\n-----------------------------------------\n");
        }

        await db.end();
        console.log("✅ Finished.");
    } catch (err) {
        console.error("❌ ERROR:", err);
    }
})();
