const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("attendr.db");

// Create table if not exists
db.run(`
    CREATE TABLE IF NOT EXISTS branding_settings (
        id INTEGER PRIMARY KEY,
        primary_color TEXT NOT NULL,
        accent_color TEXT NOT NULL
    )
`, function (err) {
    if (err) {
        console.error("Error creating branding_settings:", err);
        return;
    }

    console.log("✔ branding_settings table ready");

    // Now safely check row count
    db.get("SELECT COUNT(*) AS count FROM branding_settings", (err, row) => {
        if (err) {
            console.error("Error reading branding_settings:", err);
            return;
        }

        if (!row || row.count === 0) {
            console.log("Inserting default branding row...");

            db.run(`
                INSERT INTO branding_settings (id, primary_color, accent_color)
                VALUES (1, "#0d2b4d", "#005DFF")
            `, (err) => {
                if (err) console.error("Insert error:", err);
                else console.log("✔ Default branding values added");
            });
        } else {
            console.log("✔ Branding table already has data");
        }
    });
});

db.close();
