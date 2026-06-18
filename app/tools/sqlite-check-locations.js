const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

db.all("PRAGMA table_info(locations);", (err, rows) => {
    if (err) return console.error(err);
    console.log(rows);
    db.close();
});
