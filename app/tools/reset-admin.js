const bcrypt = require("bcryptjs");
const dbModule = require("../models/db");

const db = dbModule.db;

async function resetAdmin() {
    const email = "hudson698@hotmail.com";
    const newPassword = "admin123";

    try {
        const hash = await bcrypt.hash(newPassword, 10);

        console.log("🔐 New hash:", hash);

        db.run(
            `UPDATE users SET password = ?, name = COALESCE(name, 'Admin') WHERE email = ?`,
            [hash, email],
            function (err) {
                if (err) {
                    console.error("❌ DB Update Error:", err);
                } else {
                    console.log(`✅ Password reset for ${email}`);
                    console.log(`➡️ New login password: ${newPassword}`);
                }
                process.exit();
            }
        );
    } catch (err) {
        console.error("❌ Error hashing password:", err);
        process.exit();
    }
}

resetAdmin();
