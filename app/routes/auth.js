// routes/auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authcontroller");
 
// --------------------------------------------------
// LOCAL AUTH
// --------------------------------------------------
router.get("/login",  authController.showLogin);
router.post("/login", authController.login);
 
router.get("/reset-password",  authController.showResetPassword);
router.post("/reset-password", authController.resetPassword);
 
router.get("/logout", authController.logout);
 
// --------------------------------------------------
// ✅ NEW: AZURE AD
// /auth/azure          — redirect user to Microsoft login
// /auth/azure/callback — Microsoft redirects back here after login
// --------------------------------------------------
router.get("/auth/azure",          authController.azureLogin);
router.get("/auth/azure/callback", authController.azureCallback);
 
module.exports = router;
 