const dbLayer = require('../models/db');
const db = dbLayer.db;
const bcrypt = require('bcryptjs');

module.exports = {

    // ----------------------------------
    // SHOW SETUP PAGE (GUARDED)
    // ----------------------------------
    showSetupPage: (req, res) => {

        try {
            const row = db.prepare(
                `SELECT value FROM settings WHERE key = 'setup_complete'`
            ).get();

            if (row && row.value === '1') {
                return res.redirect('/login');
            }

            res.render('setup');

        } catch (err) {
            console.error("❌ Setup page check failed:", err);
            res.status(500).send("Setup check failed");
        }
    },

    // ----------------------------------
    // PROCESS SETUP
    // ----------------------------------
    processSetup: (req, res) => {

        try {

            if (
                !req.body ||
                !req.body.adminEmail ||
                !req.body.adminPassword ||
                !req.body.orgName
            ) {
                return res.status(400).send("Invalid setup request");
            }

            const { orgName, adminEmail, adminPassword } = req.body;
            const hashedPassword = bcrypt.hashSync(adminPassword, 10);

            // 1️⃣ Save org name
            db.prepare(`
                INSERT OR REPLACE INTO settings (key, value)
                VALUES ('org_name', ?)
            `).run(orgName);

            // 2️⃣ Create admin user (SYSTEM USER)
            db.prepare(`
                INSERT INTO users (name, email, password, role, is_system)
                VALUES (?, ?, ?, ?, 1)
            `).run('Administrator', adminEmail, hashedPassword, 'admin');

            // 3️⃣ Mark setup complete
            db.prepare(`
                INSERT OR REPLACE INTO settings (key, value)
                VALUES ('setup_complete', '1')
            `).run();

            return res.redirect('/login');

        } catch (err) {
            console.error("❌ Setup failed:", err);
            return res.status(500).send("Setup failed");
        }
    }
};