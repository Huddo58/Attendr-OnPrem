const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

// Check if table exists
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='statuses';", [], (err, rows) => {
    console.log("TABLE CHECK:", rows);

    if (!rows || rows.length === 0) {
        console.log("\n❌ The 'statuses' table does NOT exist.\n");
        return db.close();
    }

    console.log("\n✔ The table exists. Now checking rows...\n");

    db.all("SELECT * FROM statuses;", [], (err2, rows2) => {
        if (err2) {
            console.log("QUERY ERROR:", err2);
        } else {
            console.log("STATUS ROWS:", rows2);
        }

        db.close();
    });
});
