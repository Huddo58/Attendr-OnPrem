const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.serialize(() => {
    db.run("ALTER TABLE departments ADD COLUMN code TEXT;", err => {
        console.log("Add code:", err || "OK");
    });

    db.run("ALTER TABLE departments ADD COLUMN description TEXT;", err => {
        console.log("Add description:", err || "OK");
    });

    db.all("PRAGMA table_info(departments);", (err, rows) => {
        console.log("Schema:", rows);
        db.close();
    });
});
