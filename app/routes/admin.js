// routes/admin.js
const express = require("express");
const router  = express.Router();
 
const admin   = require("../controllers/admincontroller");
const User    = require("../models/userModel");
const { runManualReset } = require("../jobs/dailyStatusReset");
const { logAction }      = require("../utils/logger");
const License            = require("../models/licenseModel");
 
// ✅ Multer for logo uploads — stored in /public/uploads/branding/
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
 
const brandingUploadDir = path.join(__dirname, "../public/uploads/branding");
if (!fs.existsSync(brandingUploadDir)) {
    fs.mkdirSync(brandingUploadDir, { recursive: true });
}
 
const logoStorage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, brandingUploadDir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `logo_${Date.now()}${ext}`);
    }
});
 
const logoFilter = (req, file, cb) => {
    const allowed = /png|jpg|jpeg|svg|webp/;
    const extOk   = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk  = allowed.test(file.mimetype);
    if (extOk && mimeOk) cb(null, true);
    else cb(new Error("Logo must be a PNG, JPG, SVG or WebP file."), false);
};
 
const uploadLogo = multer({
    storage:    logoStorage,
    fileFilter: logoFilter,
    limits:     { fileSize: 2 * 1024 * 1024 } // 2MB max
});
 
// -----------------------------------------------------
// AUTH MIDDLEWARE
// -----------------------------------------------------
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}
 
function requireAdmin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    if (req.session.user.role !== "admin") return res.redirect("/dashboard");
    next();
}
 
// -----------------------------------------------------
// USERS
// -----------------------------------------------------
router.get("/users",          requireAdmin, admin.showUsers);
router.get("/settings/users", requireAdmin, admin.showUsers);
 
// -----------------------------------------------------
// SETTINGS PAGES
// -----------------------------------------------------
router.get("/settings/departments", requireAdmin, admin.showDepartments);
router.get("/settings/locations",   requireAdmin, admin.showLocations);
router.get("/settings/statuses",    requireAdmin, admin.showStatuses);
router.get("/logs",                 requireAdmin, admin.showLogs);
router.get("/settings",             requireAdmin, admin.showSettings);
 
// ✅ UPDATED: Branding always enabled — no feature flag needed
router.get("/settings/branding", requireAdmin, admin.showBranding);
 
// -----------------------------------------------------
// LEGAL
// -----------------------------------------------------
router.get("/legal", requireAdmin, (req, res) => {
    res.render("admin/legal", {
        pageTitle: "Attenddr – Legal",
        activeTab: "legal"
    });
});
 
// -----------------------------------------------------
// SETTINGS ACTIONS
// -----------------------------------------------------
router.post("/settings/behaviour", requireAdmin, admin.saveBehaviourSettings);
 
// -----------------------------------------------------
// LICENSE ACTIVATION
// -----------------------------------------------------
router.post("/settings/license", requireAdmin, (req, res) => {
 
    const { license_key } = req.body;
 
    if (!license_key || !license_key.trim()) {
        return res.redirect(
            "/admin/settings?license_error=" +
            encodeURIComponent("License key is required.")
        );
    }
 
    try {
        const result = License.activateLicenseKey(license_key.trim());
 
        if (!result || result.ok === false) {
            return res.redirect(
                "/admin/settings?license_error=" +
                encodeURIComponent(result?.error || "Invalid licence.")
            );
        }
 
        if (result.valid !== true) {
            return res.redirect(
                "/admin/settings?license_error=" +
                encodeURIComponent("Licence activation failed.")
            );
        }
 
        res.redirect("/admin/settings?license_success=1");
 
    } catch {
        return res.redirect(
            "/admin/settings?license_error=" +
            encodeURIComponent("System error during license activation.")
        );
    }
});
 
// -----------------------------------------------------
// MANUAL DAILY STATUS RESET
// -----------------------------------------------------
router.post("/settings/reset-now", requireAdmin, (req, res) => {
    try {
        logAction({
            action: "manual daily status reset triggered",
            entity: "system",
            user: req.session.user
        });
        runManualReset();
        res.redirect("/admin/settings");
    } catch {
        res.redirect("/admin/settings");
    }
});
 
// -----------------------------------------------------
// USERS ACTIONS
// -----------------------------------------------------
router.post("/users/create",     requireAdmin, admin.createUser);
router.post("/users/delete/:id", requireAdmin, admin.deleteUser);
router.post("/users/reset/:id",  requireAdmin, admin.resetPassword);
 
router.post("/users/edit/:id", requireAdmin, (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, departments } = req.body;
 
        let deptArray = [];
        if (Array.isArray(departments)) deptArray = departments;
        else if (departments) deptArray = [departments];
 
        User.update(userId, name, email, role, deptArray);
 
        logAction({
            action: "updated user details",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/admin/users");
 
    } catch {
        res.send("Database error updating user.");
    }
});
 
// -----------------------------------------------------
// DEPARTMENTS
// -----------------------------------------------------
router.post("/departments/create",     requireAdmin, admin.createDepartment);
router.post("/departments/edit/:id",   requireAdmin, admin.updateDepartment);
router.post("/departments/delete/:id", requireAdmin, admin.deleteDepartment);
 
// -----------------------------------------------------
// LOCATIONS
// -----------------------------------------------------
router.post("/locations/create",     requireAdmin, admin.createLocation);
router.post("/locations/edit/:id",   requireAdmin, admin.updateLocation);
router.post("/locations/delete/:id", requireAdmin, admin.deleteLocation);
router.post("/locations/cidr",       requireAdmin, admin.updateLocationCidr);
 
// -----------------------------------------------------
// STATUSES
// -----------------------------------------------------
router.post("/statuses/add",         requireAdmin, admin.createStatus);
router.post("/statuses/delete/:id",  requireAdmin, admin.deleteStatus);
router.post("/statuses/edit/:id",    requireAdmin, admin.updateStatus);
 
// -----------------------------------------------------
// ✅ BRANDING ROUTES
// -----------------------------------------------------
 
// Save brand colour
router.post("/settings/branding/color", requireAdmin, admin.updateBrandColor);
 
// Upload custom logo
router.post(
    "/settings/branding/logo",
    requireAdmin,
    (req, res, next) => {
        uploadLogo.single("logo")(req, res, (err) => {
            if (err) {
                console.error("Logo upload error:", err.message);
                return res.redirect(
                    "/admin/settings/branding?error=" +
                    encodeURIComponent(err.message)
                );
            }
            next();
        });
    },
    admin.uploadLogo
);
 
// Remove custom logo
router.post("/settings/branding/logo/remove", requireAdmin, admin.removeLogo);
 
// Reset everything to defaults
router.post("/settings/branding/reset", requireAdmin, admin.resetBranding);
 
// -----------------------------------------------------
module.exports = router;