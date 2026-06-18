const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

// 1. Add name column if missing
db.run("ALTER TABLE users ADD COLUMN name TEXT;", (err) => {
    console.log(err ? "Name column exists already" : "Added name column");
});

// 2. Create user_departments table
db.run(`
    CREATE TABLE IF NOT EXISTS user_departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        department_id INTEGER
    );
`, (err) => {
    console.log(err ? err : "Created user_departments table");
});

// 3. Check schema
db.all("PRAGMA table_info(users);", (err, rows) => {
    console.log("\nUsers schema:", rows);
});

db.close();
