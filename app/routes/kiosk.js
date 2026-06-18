// routes/kiosk.js
const express = require("express");
const router = express.Router();

const User = require("../models/userModel");
const Department = require("../models/departmentModel");
const Status = require("../models/statusModel");

// -----------------------------------------------------
// KIOSK (PUBLIC – NO LOGIN REQUIRED)
// -----------------------------------------------------
router.get("/kiosk", (req, res) => {

    try {

        const users = User.getAllWithLatestStatus(null);
        const departments = Department.getAll();
        const statuses = Status.getAll();

        res.render("kiosk", {
            users: users || [],
            statuses: statuses || [],
            departments: departments || []
        });

    } catch (err) {
        console.error("Kiosk load error:", err);
        res.send("Error loading kiosk");
    }
});

module.exports = router;