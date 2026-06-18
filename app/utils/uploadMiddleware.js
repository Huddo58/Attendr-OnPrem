// utils/uploadMiddleware.js
// Multer configuration for profile photo uploads.
// Handles file type validation, size limits, and filename generation.
// Photos are stored in app/public/uploads/avatars/
 
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
 
// ------------------------------------------------------
// ENSURE UPLOAD DIRECTORY EXISTS
// Called once at startup from server.js
// ------------------------------------------------------
function ensureUploadDirs() {
    const dirs = [
        path.join(__dirname, "../public/uploads"),
        path.join(__dirname, "../public/uploads/avatars")
    ];
 
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created upload directory: ${dir}`);
        }
    }
}
 
// ------------------------------------------------------
// STORAGE ENGINE
// Files are saved to app/public/uploads/avatars/
// Filename format: user_<userId>_<timestamp>.<ext>
// e.g. user_5_1714000000000.jpg
// Using userId in the filename means uploading a new
// photo automatically replaces the concept of the old
// one (though we clean up old files too)
// ------------------------------------------------------
const storage = multer.diskStorage({
 
    destination(req, file, cb) {
        const uploadPath = path.join(__dirname, "../public/uploads/avatars");
        cb(null, uploadPath);
    },
 
    filename(req, file, cb) {
        const userId    = req.session?.user?.id || "unknown";
        const ext       = path.extname(file.originalname).toLowerCase();
        const timestamp = Date.now();
        const filename  = `user_${userId}_${timestamp}${ext}`;
        cb(null, filename);
    }
});
 
// ------------------------------------------------------
// FILE FILTER
// Only allow image files — jpg, jpeg, png, gif, webp
// Rejects anything else with a clear error message
// ------------------------------------------------------
function fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extValid  = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
    );
    const mimeValid = allowedTypes.test(file.mimetype);
 
    if (extValid && mimeValid) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed (jpg, png, gif, webp)."), false);
    }
}
 
// ------------------------------------------------------
// MULTER INSTANCE
// 5MB size limit — plenty for a profile photo
// ------------------------------------------------------
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});
 
// ------------------------------------------------------
// DELETE OLD PHOTO
// Called before saving a new photo to clean up the old file.
// Silently ignores errors (file may not exist).
// ------------------------------------------------------
function deleteOldPhoto(photoPath) {
    if (!photoPath) return;
 
    try {
        // photoPath is stored as a web path like /uploads/avatars/user_5_xxx.jpg
        // Convert to filesystem path
        const fsPath = path.join(__dirname, "../public", photoPath);
 
        if (fs.existsSync(fsPath)) {
            fs.unlinkSync(fsPath);
        }
    } catch {
        // Non-critical — don't crash if we can't delete the old file
    }
}
 
module.exports = {
    upload,
    ensureUploadDirs,
    deleteOldPhoto
};