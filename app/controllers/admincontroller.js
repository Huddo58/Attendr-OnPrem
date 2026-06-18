// controllers/admincontroller.js
const path   = require("path");
const fs     = require("fs");
const bcrypt = require("bcryptjs");
 
const User       = require("../models/userModel");
const Department = require("../models/departmentModel");
const Location   = require("../models/locationModel");
const Status     = require("../models/statusModel");
const Settings   = require("../models/settingsModel");
const Branding   = require("../models/brandingModel");
const License    = require("../models/licenseModel");
const { logAction } = require("../utils/logger");
 
// =====================================================
// USERS
// =====================================================
 
exports.showUsers = (req, res) => {
    try {
        const users       = User.getAllWithDepartments();
        const departments = Department.getAll();
        const locations   = Location.getAll();
        const statuses    = Status.getAll();
 
        res.render("admin/users", {
            users,
            departments,
            locations,
            statuses,
            query: req.query
        });
    } catch {
        res.send("Error loading users.");
    }
};
 
exports.createUser = async (req, res) => {
    const { name, email, password, role, departments } = req.body;
 
    try {
        const result = License.canAddUser();
 
        if (!result.allowed) {
            const q = result.reason
                ? `&message=${encodeURIComponent(result.reason)}`
                : "";
            return res.redirect(`/admin/users?error=user_limit${q}`);
        }
 
        const deptArray = Array.isArray(departments)
            ? departments
            : (departments ? [departments] : []);
 
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = User.create(name, email, hashedPassword, role, deptArray);
 
        logAction({
            action: "created",
            entity: "user",
            entityId: user.id,
            targetName: name,
            user: req.session.user
        });
 
        User.setMustResetPassword(user.id, 1);
 
        // Save status preferences if provided
        const { default_location_id, home_status_id, away_status_id } = req.body;
        if (default_location_id || home_status_id || away_status_id) {
            const Profile = require("../models/profileModel");
            Profile.updateStatusPreferences(user.id, {
                defaultLocationId: default_location_id || null,
                homeStatusId:      home_status_id      || null,
                awayStatusId:      away_status_id      || null
            });
        }
 
        res.redirect("/admin/users");
 
    } catch {
        res.send("Error creating user.");
    }
};
 
exports.deleteUser = (req, res) => {
    try {
        const userId = req.params.id;
        User.delete(userId);
 
        logAction({
            action: "deleted",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/admin/users");
    } catch {
        res.send("Error deleting user.");
    }
};
 
exports.resetPassword = async (req, res) => {
    try {
        const userId         = req.params.id;
        const defaultPassword = "Attendr123!";
        const hashedPassword  = await bcrypt.hash(defaultPassword, 10);
 
        User.resetPassword(userId, hashedPassword);
 
        logAction({
            action: "password reset",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });
 
        res.redirect("/admin/users?passwordReset=1");
 
    } catch {
        res.send("Error resetting password.");
    }
};
 
// =====================================================
// DEPARTMENTS
// =====================================================
 
exports.showDepartments = (req, res) => {
    try {
        const departments = Department.getAll();
        res.render("admin/departments", { departments, query: req.query });
    } catch {
        res.send("Error loading departments.");
    }
};
 
exports.createDepartment = (req, res) => {
    try {
        const { name, code, description } = req.body;
        const result = Department.create(name, code, description || "");
 
        logAction({
            action: "created",
            entity: "department",
            entityId: result.id,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/departments");
    } catch {
        res.send("Error creating department.");
    }
};
 
exports.updateDepartment = (req, res) => {
    try {
        const id = req.params.id;
        const { name, code, description } = req.body;
 
        Department.update(id, name, code, description || "");
 
        logAction({
            action: "updated department",
            entity: "department",
            entityId: id,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/departments?updated=1");
    } catch {
        res.send("Error updating department.");
    }
};
 
exports.deleteDepartment = (req, res) => {
    try {
        const id = req.params.id;
        Department.delete(id);
 
        logAction({
            action: "deleted",
            entity: "department",
            entityId: id,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/departments");
    } catch {
        res.send("Error deleting department.");
    }
};
 
// =====================================================
// LOCATIONS
// =====================================================
 
exports.showLocations = (req, res) => {
    try {
        const locations = Location.getAll();
        res.render("admin/locations", { locations, query: req.query });
    } catch {
        res.send("Error loading locations.");
    }
};
 
exports.createLocation = (req, res) => {
    try {
        const { name, code, address, cidr } = req.body;
        const result = Location.create(name, code, address || "", cidr || "");
 
        logAction({
            action: "created",
            entity: "location",
            entityId: result.id,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/locations");
    } catch {
        res.send("Error creating location.");
    }
};
 
exports.updateLocation = (req, res) => {
    try {
        const id = req.params.id;
        const { name, code, address } = req.body;
 
        Location.update(id, name, code, address || "");
 
        logAction({
            action: "updated location",
            entity: "location",
            entityId: id,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/locations?updated=1");
    } catch {
        res.send("Error updating location.");
    }
};
 
exports.updateLocationCidr = (req, res) => {
    try {
        const { id, cidr } = req.body;
        Location.updateCidr(id, cidr || "");
 
        logAction({
            action: "updated CIDR range",
            entity: "location",
            entityId: id,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/locations?cidr_saved=1");
    } catch {
        res.send("Error updating CIDR range.");
    }
};
 
exports.deleteLocation = (req, res) => {
    try {
        const id = req.params.id;
        Location.delete(id);
 
        logAction({
            action: "deleted",
            entity: "location",
            entityId: id,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/locations");
    } catch {
        res.send("Error deleting location.");
    }
};
 
// =====================================================
// STATUSES
// =====================================================
 
exports.showStatuses = (req, res) => {
    try {
        const statuses = Status.getAll();
        res.render("admin/statuses", { statuses, query: req.query });
    } catch {
        res.send("Error loading statuses.");
    }
};
 
exports.createStatus = (req, res) => {
    try {
        const { name, color, sort_order, exclude_from_reset } = req.body;
        const statusId = Status.create(name, color, sort_order, exclude_from_reset);
 
        logAction({
            action: "created",
            entity: "status",
            entityId: statusId,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/statuses");
    } catch {
        res.send("Error creating status.");
    }
};
 
exports.updateStatus = (req, res) => {
    try {
        const { name, color, sort_order, exclude_from_reset } = req.body;
        const id = req.params.id;
 
        Status.update(id, name, color, sort_order, exclude_from_reset);
 
        logAction({
            action: "updated",
            entity: "status",
            entityId: id,
            targetName: name,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/statuses");
    } catch {
        res.status(500).send("Error updating status.");
    }
};
 
exports.deleteStatus = (req, res) => {
    try {
        const id = req.params.id;
        Status.delete(id);
 
        logAction({
            action: "deleted",
            entity: "status",
            entityId: id,
            user: req.session.user
        });
 
        res.redirect("/admin/settings/statuses");
    } catch {
        res.send("Error deleting status.");
    }
};
 
// =====================================================
// SETTINGS
// =====================================================
 
exports.showSettings = (req, res) => {
    try {
        const settings = Settings.getAll();
        const license  = License.getCurrent();
 
        res.render("admin/settings", { settings, license, query: req.query });
    } catch {
        res.send("Error loading settings.");
    }
};
 
exports.saveBehaviourSettings = (req, res) => {
    try {
        const enabled = req.body.daily_reset_enabled ? "1" : "0";
        Settings.set("daily_reset_enabled", enabled);
 
        logAction({
            action: "updated behaviour settings",
            entity: "settings",
            targetName: "behaviour settings",
            user: req.session.user
        });
 
        res.redirect("/admin/settings");
    } catch {
        res.send("Error saving settings.");
    }
};
 
// =====================================================
// BRANDING
// =====================================================


exports.showBranding = (req, res) => {
    try {
        res.render("admin/branding", { query: req.query });
    } catch {
        res.send("Error loading branding.");
    }
};


// ✅ UPDATED: Save brand colour only (single colour, not primary+accent)
exports.updateBrandColor = (req, res) => {
    try {
        const { brand_color } = req.body;
 
        // Validate — must be a valid hex colour
        if (!brand_color || !/^#[0-9a-fA-F]{6}$/.test(brand_color)) {
            return res.redirect("/admin/settings/branding?error=invalid_color");
        }
 
        Branding.updateBrandColor(brand_color);
 
        logAction({
            action: "updated brand colour",
            entity: "branding",
            user: req.session.user
        });
 
        res.redirect("/admin/settings/branding?color_saved=1");
    } catch {
        res.send("Error updating brand colour.");
    }
};
 
// ✅ NEW: Upload custom logo
exports.uploadLogo = (req, res) => {
    try {
        if (!req.file) {
            return res.redirect("/admin/settings/branding?error=no_file");
        }
 
        // Delete old logo file if one exists
        const current = Branding.getSettings();
        if (current.logo_path) {
            const oldPath = path.join(__dirname, "../public", current.logo_path);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch {}
            }
        }
 
        const logoPath = `/uploads/branding/${req.file.filename}`;
        Branding.updateLogo(logoPath);
 
        logAction({
            action: "uploaded custom logo",
            entity: "branding",
            user: req.session.user
        });
 
        res.redirect("/admin/settings/branding?logo_saved=1");
    } catch {
        res.send("Error uploading logo.");
    }
};
 
// ✅ NEW: Remove custom logo — reverts to Attenddr default
exports.removeLogo = (req, res) => {
    try {
        const current = Branding.getSettings();
 
        if (current.logo_path) {
            const filePath = path.join(__dirname, "../public", current.logo_path);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
 
        Branding.removeLogo();
 
        logAction({
            action: "removed custom logo",
            entity: "branding",
            user: req.session.user
        });
 
        res.redirect("/admin/settings/branding?logo_removed=1");
    } catch {
        res.send("Error removing logo.");
    }
};
 
// ✅ UPDATED: Reset resets both colour and logo
exports.resetBranding = (req, res) => {
    try {
        // Delete uploaded logo file if one exists
        const current = Branding.getSettings();
        if (current.logo_path) {
            const filePath = path.join(__dirname, "../public", current.logo_path);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
 
        Branding.resetDefaults();
 
        logAction({
            action: "reset branding to defaults",
            entity: "branding",
            user: req.session.user
        });
 
        res.redirect("/admin/settings/branding?reset=1");
    } catch {
        res.send("Error resetting branding.");
    }
};
 
// =====================================================
// AUDIT LOGS
// =====================================================
 
exports.showLogs = (req, res) => {
    try {
        const { getLogs } = require("../utils/logger");
        const logs = getLogs();
        res.render("admin/logs", { logs, query: req.query });
    } catch (err) {
        console.error("showLogs failed:", err);
        res.send("Error loading logs: " + err.message);
    }
};