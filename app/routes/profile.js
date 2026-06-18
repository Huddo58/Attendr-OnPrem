// routes/profile.js
// All profile-related routes.
// Mounted at /profile in server.js
 
const express    = require("express");
const router     = express.Router();
const profile    = require("../controllers/profileController");
const { upload } = require("../utils/uploadMiddleware");
 
// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}
 
// --------------------------------------------------
// VIEW PROFILE
// GET /profile         — logged-in user's own profile
// GET /profile?userId=x — admin viewing another user
// --------------------------------------------------
router.get("/", requireLogin, profile.showProfile);
 
// --------------------------------------------------
// UPDATE PHONE (user editable)
// --------------------------------------------------
router.post("/phone", requireLogin, profile.updatePhone);
 
// --------------------------------------------------
// UPLOAD PHOTO
// --------------------------------------------------
router.post(
    "/photo",
    requireLogin,
    (req, res, next) => {
        upload.single("photo")(req, res, (err) => {
            if (err) {
                console.error("❌ Upload error:", err.message);
                return res.redirect("/profile?photo_error=1&msg=" +
                    encodeURIComponent(err.message));
            }
            next();
        });
    },
    profile.uploadPhoto
);
 
// --------------------------------------------------
// REMOVE PHOTO
// --------------------------------------------------
router.post("/photo/remove", requireLogin, profile.removePhoto);
 
// --------------------------------------------------
// UPDATE ADMIN FIELDS (admin only)
// employee_id, job_title, manager
// --------------------------------------------------
router.post("/admin-fields", requireLogin, profile.updateAdminFields);
 
// --------------------------------------------------
// ✅ NEW: UPDATE STATUS PREFERENCES
// default_location_id, home_status_id, away_status_id
// Users can set their own. Admins can set for any user.
// --------------------------------------------------
router.post("/status-preferences", requireLogin, profile.updateStatusPreferences);
 
module.exports = router;