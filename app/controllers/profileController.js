// controllers/profileController.js
const Profile = require("../models/profileModel");
const { deleteOldPhoto } = require("../utils/uploadMiddleware");
const { logAction } = require("../utils/logger");
 
// --------------------------------------------------
// SHOW PROFILE PAGE
// --------------------------------------------------
exports.showProfile = (req, res) => {
    try {
        const currentUser  = req.session.user;
        const isAdmin      = currentUser.role === "admin";
        const requestedId  = req.query.userId ? parseInt(req.query.userId, 10) : null;
 
        // Non-admins can only view their own profile
        if (requestedId && requestedId !== currentUser.id && !isAdmin) {
            return res.redirect("/profile");
        }
 
        const targetUserId = requestedId || currentUser.id;
        const isOwnProfile = targetUserId === currentUser.id;
 
        const profile = Profile.getFullProfile(targetUserId);
 
        if (!profile) {
            return res.redirect("/dashboard");
        }
 
        // Load locations and statuses for the preference dropdowns
        const Location = require("../models/locationModel");
        const Status   = require("../models/statusModel");
 
        const locations = Location.getAll();
        const statuses  = Status.getAll();
 
        res.render("profile", {
            profile,
            isOwnProfile,
            isAdmin,
            locations,
            statuses,
            query: req.query
        });
 
    } catch (err) {
        console.error("❌ showProfile error:", err);
        res.send("Error loading profile.");
    }
};
 
// --------------------------------------------------
// UPDATE PHONE (user editable)
// --------------------------------------------------
exports.updatePhone = (req, res) => {
    try {
        const userId = req.session.user.id;
        const { phone } = req.body;
 
        Profile.updateUserFields(userId, { phone: phone || "" });
 
        logAction({
            action: "updated profile phone number",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/profile?saved=1");
 
    } catch (err) {
        console.error("❌ updatePhone error:", err);
        res.redirect("/profile?error=1");
    }
};
 
// --------------------------------------------------
// UPLOAD PHOTO (user editable)
// --------------------------------------------------
exports.uploadPhoto = (req, res) => {
    try {
        const userId = req.session.user.id;
 
        if (!req.file) {
            return res.redirect("/profile?photo_error=1");
        }
 
        const existing = Profile.getByUserId(userId);
        if (existing?.photo_path) {
            deleteOldPhoto(existing.photo_path);
        }
 
        const photoPath = `/uploads/avatars/${req.file.filename}`;
 
        Profile.updatePhoto(userId, photoPath);
 
        req.session.user.photo_path = photoPath;
        req.session.save(() => {});
 
        logAction({
            action: "updated profile photo",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/profile?photo_saved=1");
 
    } catch (err) {
        console.error("❌ uploadPhoto error:", err);
        res.redirect("/profile?photo_error=1");
    }
};
 
// --------------------------------------------------
// REMOVE PHOTO (user editable)
// --------------------------------------------------
exports.removePhoto = (req, res) => {
    try {
        const userId = req.session.user.id;
 
        const existing = Profile.getByUserId(userId);
        if (existing?.photo_path) {
            deleteOldPhoto(existing.photo_path);
        }
 
        Profile.updatePhoto(userId, null);
 
        req.session.user.photo_path = null;
        req.session.save(() => {});
 
        logAction({
            action: "removed profile photo",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/profile?photo_removed=1");
 
    } catch (err) {
        console.error("❌ removePhoto error:", err);
        res.redirect("/profile?error=1");
    }
};
 
// --------------------------------------------------
// UPDATE ADMIN FIELDS (admin only)
// employee_id, job_title, manager
// --------------------------------------------------
exports.updateAdminFields = (req, res) => {
    try {
        if (req.session.user.role !== "admin") {
            return res.redirect("/profile");
        }
 
        const { userId, employee_id, job_title, manager } = req.body;
        const targetId = parseInt(userId, 10);
 
        Profile.updateAdminFields(targetId, {
            employeeId: employee_id || "",
            jobTitle:   job_title   || "",
            manager:    manager     || ""
        });
 
        logAction({
            action: "updated profile admin fields",
            entity: "user",
            entityId: targetId,
            user: req.session.user
        });
 
        res.redirect(`/profile?userId=${targetId}&admin_saved=1`);
 
    } catch (err) {
        console.error("❌ updateAdminFields error:", err);
        res.redirect("/profile?error=1");
    }
};
 
// --------------------------------------------------
// ✅ NEW: UPDATE STATUS PREFERENCES
// default_location_id, home_status_id, away_status_id
// Users can set their own. Admins can set for any user.
// --------------------------------------------------
exports.updateStatusPreferences = (req, res) => {
    try {
        const currentUser = req.session.user;
        const isAdmin     = currentUser.role === "admin";
 
        // Determine target user
        // Admins can update any user via userId in body
        // Regular users can only update themselves
        const targetId = (isAdmin && req.body.userId)
            ? parseInt(req.body.userId, 10)
            : currentUser.id;
 
        const {
            default_location_id,
            home_status_id,
            away_status_id
        } = req.body;
 
        Profile.updateStatusPreferences(targetId, {
            defaultLocationId: default_location_id || null,
            homeStatusId:      home_status_id      || null,
            awayStatusId:      away_status_id      || null
        });
 
        logAction({
            action: "updated status preferences",
            entity: "user",
            entityId: targetId,
            user: currentUser
        });
 
        // Redirect back to the right profile page
        if (isAdmin && req.body.userId && parseInt(req.body.userId, 10) !== currentUser.id) {
            res.redirect(`/profile?userId=${targetId}&prefs_saved=1`);
        } else {
            res.redirect("/profile?prefs_saved=1");
        }
 
    } catch (err) {
        console.error("❌ updateStatusPreferences error:", err);
        res.redirect("/profile?error=1");
    }
};
 