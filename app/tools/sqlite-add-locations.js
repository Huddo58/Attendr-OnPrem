const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            code TEXT
        );
    `, () => {
        console.log("✔ locations table created/verified");
        db.close();
    });
});
