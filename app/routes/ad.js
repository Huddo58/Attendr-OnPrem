// routes/ad.js
const express = require("express");
const router  = express.Router();
const ad      = require("../controllers/adController");

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    if (req.session.user.role !== "admin") return res.redirect("/dashboard");
    next();
}

// --------------------------------------------------
// INTEGRATIONS PAGE
// --------------------------------------------------
router.get("/", requireAdmin, ad.showIntegrations);

// --------------------------------------------------
// SAVE CONFIG
// --------------------------------------------------
router.post("/azure/save",  requireAdmin, ad.saveAzureConfig);
router.post("/ldap/save",   requireAdmin, ad.saveLdapConfig);

// --------------------------------------------------
// TEST CONNECTIONS
// --------------------------------------------------
router.post("/azure/test",  requireAdmin, ad.testAzure);
router.post("/ldap/test",   requireAdmin, ad.testLdap);

// --------------------------------------------------
// GROUP BROWSER (JSON)
// GET  /admin/integrations/ldap/groups?search=term
// --------------------------------------------------
router.get("/ldap/groups",  requireAdmin, ad.browseAdGroups);

// --------------------------------------------------
// PREVIEW SYNC (JSON)
// POST /admin/integrations/ldap/preview
// Body: { groups: "Group A,Group B" }
// --------------------------------------------------
router.post("/ldap/preview", requireAdmin, ad.previewSync);

// --------------------------------------------------
// SYNC
// --------------------------------------------------
router.post("/sync",        requireAdmin, ad.triggerSync);

// --------------------------------------------------
// FLAGGED USER REVIEW
// --------------------------------------------------
router.post("/flag/resolve/:id",  requireAdmin, ad.resolveFlag);
router.post("/flag/deactivate",   requireAdmin, ad.deactivateFlagged);

module.exports = router;
