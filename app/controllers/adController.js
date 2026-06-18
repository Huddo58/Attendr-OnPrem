// controllers/adController.js
const User = require("../models/userModel");
const Settings = require("../models/settingsModel");
const { runSync } = require("../utils/adSync");
const { testAzureConnection } = require("../utils/azureAuth");
const { testLdapConnection, browseGroups, previewGroupSync } = require("../utils/ldapAuth");
const { logAction } = require("../utils/logger");

// --------------------------------------------------
// SHOW INTEGRATIONS PAGE
// --------------------------------------------------
exports.showIntegrations = (req, res) => {
    try {
        const settings = Settings.getAll();
        const flagged  = User.getADFlagged();

        res.render("admin/integrations", {
            settings,
            flagged,
            query: req.query
        });
    } catch (err) {
        console.error("❌ showIntegrations error:", err);
        res.send("Error loading integrations page.");
    }
};

// --------------------------------------------------
// SAVE AZURE CONFIG
// --------------------------------------------------
exports.saveAzureConfig = (req, res) => {
    try {
        const {
            ad_azure_enabled,
            ad_azure_tenant_id,
            ad_azure_client_id,
            ad_azure_client_secret,
            ad_azure_redirect_uri
        } = req.body;

        Settings.setMultiple({
            ad_azure_enabled:       ad_azure_enabled      ? "1" : "0",
            ad_azure_tenant_id:     ad_azure_tenant_id    || "",
            ad_azure_client_id:     ad_azure_client_id    || "",
            ad_azure_client_secret: ad_azure_client_secret || "",
            ad_azure_redirect_uri:  ad_azure_redirect_uri  || ""
        });

        logAction({
            action: "updated Azure AD config",
            entity: "settings",
            user: req.session.user
        });

        res.redirect("/admin/integrations?azure_saved=1");

    } catch (err) {
        console.error("❌ saveAzureConfig error:", err);
        res.send("Error saving Azure config.");
    }
};

// --------------------------------------------------
// SAVE LDAP CONFIG
// --------------------------------------------------
exports.saveLdapConfig = (req, res) => {
    try {
        const {
            ad_ldap_enabled,
            ad_ldap_url,
            ad_ldap_port,
            ad_ldap_base_dn,
            ad_ldap_service_dn,
            ad_ldap_service_password,
            ad_ldap_user_attribute,
            ad_ldap_sync_ou,
            ad_ldap_sync_mode,
            ad_ldap_sync_groups,
            ad_default_role
        } = req.body;

        Settings.setMultiple({
            ad_ldap_enabled:          ad_ldap_enabled   ? "1" : "0",
            ad_ldap_url:              ad_ldap_url              || "",
            ad_ldap_port:             ad_ldap_port             || "389",
            ad_ldap_base_dn:          ad_ldap_base_dn          || "",
            ad_ldap_service_dn:       ad_ldap_service_dn       || "",
            ad_ldap_service_password: ad_ldap_service_password || "",
            ad_ldap_user_attribute:   ad_ldap_user_attribute   || "userPrincipalName",
            ad_ldap_sync_ou:          ad_ldap_sync_ou          || "",
            ad_ldap_sync_mode:        ad_ldap_sync_mode        || "ou",
            ad_ldap_sync_groups:      ad_ldap_sync_groups      || "",
            ad_default_role:          ad_default_role          || "user"
        });

        logAction({
            action: "updated LDAP config",
            entity: "settings",
            user: req.session.user
        });

        res.redirect("/admin/integrations?ldap_saved=1");

    } catch (err) {
        console.error("❌ saveLdapConfig error:", err);
        res.send("Error saving LDAP config.");
    }
};

// --------------------------------------------------
// TEST AZURE CONNECTION
// --------------------------------------------------
exports.testAzure = async (req, res) => {
    try {
        const result = await testAzureConnection();
        res.json(result);
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
};

// --------------------------------------------------
// TEST LDAP CONNECTION
// --------------------------------------------------
exports.testLdap = async (req, res) => {
    try {
        const result = await testLdapConnection();
        res.json(result);
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
};

// --------------------------------------------------
// BROWSE AD GROUPS
// Returns a list of groups from AD for the picker UI.
// Accepts optional ?search= query param to filter results.
// --------------------------------------------------
exports.browseAdGroups = async (req, res) => {
    try {
        const searchTerm = req.query.search || "";
        const result = await browseGroups(searchTerm);
        res.json(result);
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
};

// --------------------------------------------------
// PREVIEW GROUP SYNC
// Returns user counts per group without importing.
// Body: { groups: "Group A,Group B,Group C" }
// --------------------------------------------------
exports.previewSync = async (req, res) => {
    try {
        const groupsRaw = req.body.groups || "";
        const groupNames = groupsRaw
            .split(",")
            .map(g => g.trim())
            .filter(Boolean);

        if (groupNames.length === 0) {
            return res.json({ ok: false, error: "No groups specified." });
        }

        const result = await previewGroupSync(groupNames);
        res.json(result);

    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
};

// --------------------------------------------------
// TRIGGER SYNC
// --------------------------------------------------
exports.triggerSync = async (req, res) => {
    try {
        logAction({
            action: "triggered AD sync",
            entity: "settings",
            user: req.session.user
        });

        const result = await runSync();

        if (result.ok) {
            const s = result.summary;
            const msg = `Sync complete — ${s.imported} imported, ${s.skipped} skipped, ${s.flagged} flagged`;
            res.redirect(`/admin/integrations?sync_done=1&msg=${encodeURIComponent(msg)}`);
        } else {
            res.redirect(`/admin/integrations?sync_error=1&msg=${encodeURIComponent(result.error || "Sync failed")}`);
        }

    } catch (err) {
        console.error("❌ triggerSync error:", err);
        res.redirect(`/admin/integrations?sync_error=1&msg=${encodeURIComponent(err.message)}`);
    }
};

// --------------------------------------------------
// RESOLVE FLAGGED USER
// --------------------------------------------------
exports.resolveFlag = (req, res) => {
    try {
        const flagId = req.params.id;
        User.resolveADFlag(flagId);

        logAction({
            action: "resolved AD flagged user review",
            entity: "user",
            entityId: flagId,
            user: req.session.user
        });

        res.redirect("/admin/integrations?flag_resolved=1");

    } catch (err) {
        console.error("❌ resolveFlag error:", err);
        res.send("Error resolving flag.");
    }
};

// --------------------------------------------------
// DEACTIVATE FLAGGED USER
// --------------------------------------------------
exports.deactivateFlagged = (req, res) => {
    try {
        const { userId, flagId } = req.body;

        User.deactivate(userId);
        User.resolveADFlag(flagId);

        logAction({
            action: "deactivated user flagged by AD sync",
            entity: "user",
            entityId: userId,
            user: req.session.user
        });

        res.redirect("/admin/integrations?flag_resolved=1");

    } catch (err) {
        console.error("❌ deactivateFlagged error:", err);
        res.send("Error deactivating user.");
    }
};
