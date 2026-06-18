// controllers/authcontroller.js
const bcrypt = require("bcryptjs");
const dbLayer = require("../models/db");
const User = require("../models/userModel");
const Settings = require("../models/settingsModel");
const { logAction } = require("../utils/logger");
const { getAuthCodeUrl, handleCallback } = require("../utils/azureAuth");

module.exports = {

    // --------------------------------------------------
    // LOGIN PAGE
    // --------------------------------------------------
    showLogin(req, res) {
        if (req.session?.user) {
            return res.redirect("/dashboard");
        }

        const azureEnabled = Settings.get("ad_azure_enabled") === "1";
        const ldapEnabled  = Settings.get("ad_ldap_enabled")  === "1";

        res.render("login", { azureEnabled, ldapEnabled, error: null });
    },

    // --------------------------------------------------
    // LOGIN (email + password)
    // Flow:
    //   1. Find user by email
    //   2. If auth_source = 'azure' → tell them to use the Microsoft button
    //   3. If auth_source = 'ldap'  → bcrypt check (same as local)
    //                                 AD sync sets default password + must_reset
    //   4. Otherwise                → local bcrypt check
    // --------------------------------------------------
    async login(req, res) {

        const { email, password } = req.body;

        const azureEnabled = Settings.get("ad_azure_enabled") === "1";
        const ldapEnabled  = Settings.get("ad_ldap_enabled")  === "1";

        const renderLogin = (error) => res.render("login", {
            azureEnabled,
            ldapEnabled,
            error
        });

        if (!email || !password) {
            return renderLogin("Please enter your email and password.");
        }

        try {

            // -------------------------------------------------------
            // SQLITE PATH
            // -------------------------------------------------------
            if (dbLayer.type === "sqlite") {

                const user = dbLayer.db.prepare(
                    "SELECT * FROM users WHERE LOWER(email) = LOWER(?)"
                ).get(email);

                if (!user) {
                    logAction({
                        action: "login failed (user not found)",
                        entity: "user",
                        entityId: null,
                        user: null
                    });
                    return renderLogin("Invalid login.");
                }

                // --------------------------------------------------
                // AZURE USER — must use Microsoft button
                // --------------------------------------------------
                if (user.auth_source === "azure") {
                    return renderLogin(
                        "Your account uses Microsoft sign-in. Please use the \"Sign in with Microsoft\" button below."
                    );
                }

                // --------------------------------------------------
                // LDAP USER — bcrypt check (same as local)
                // AD sync imports users with a default password and
                // must_reset_password = 1 so they set their own
                // password on first login.
                // --------------------------------------------------
                if (user.auth_source === "ldap") {
                    const match = await bcrypt.compare(password, user.password);

                    if (!match) {
                        logAction({
                            action: "login failed (invalid password)",
                            entity: "user",
                            entityId: user.id,
                            user: null
                        });
                        return renderLogin("Invalid login.");
                    }

                    return completeLogin(user, req, res);
                }

                // --------------------------------------------------
                // LOCAL USER — standard bcrypt check
                // --------------------------------------------------
                const match = await bcrypt.compare(password, user.password);

                if (!match) {
                    logAction({
                        action: "login failed (invalid password)",
                        entity: "user",
                        entityId: user.id,
                        user: null
                    });
                    return renderLogin("Invalid login.");
                }

                return completeLogin(user, req, res);
            }

            // -------------------------------------------------------
            // POSTGRES PATH
            // -------------------------------------------------------
            else if (dbLayer.type === "postgres") {

                const result = await dbLayer.db.query(
                    "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
                    [email]
                );

                if (result.rows.length === 0) {
                    logAction({
                        action: "login failed (user not found)",
                        entity: "user",
                        entityId: null,
                        user: null
                    });
                    return renderLogin("Invalid login.");
                }

                const user = result.rows[0];
                const match = await bcrypt.compare(password, user.password);

                if (!match) {
                    logAction({
                        action: "login failed (invalid password)",
                        entity: "user",
                        entityId: user.id,
                        user: null
                    });
                    return renderLogin("Invalid login.");
                }

                return completeLogin(user, req, res);
            }

        } catch (err) {
            console.error("Login error:", err);
            renderLogin("Unexpected error occurred.");
        }
    },

    // --------------------------------------------------
    // AZURE AD LOGIN — redirect to Microsoft
    // --------------------------------------------------
    async azureLogin(req, res) {
        try {
            const url = await getAuthCodeUrl(req);
            res.redirect(url);
        } catch (err) {
            console.error("Azure login error:", err);
            res.redirect("/login?error=azure_failed");
        }
    },

    // --------------------------------------------------
    // AZURE AD CALLBACK — handle redirect from Microsoft
    // --------------------------------------------------
    async azureCallback(req, res) {

        const azureEnabled = Settings.get("ad_azure_enabled") === "1";
        const ldapEnabled  = Settings.get("ad_ldap_enabled")  === "1";

        const renderLogin = (error) => res.render("login", {
            azureEnabled,
            ldapEnabled,
            error
        });

        try {
            const adUser = await handleCallback(req);

            if (!adUser || !adUser.email) {
                return renderLogin("Azure sign-in failed — no user info returned.");
            }

            let user = User.getByEmail(adUser.email);

            if (!user) {
                const defaultRole = Settings.get("ad_default_role") || "user";

                User.createFromAD({
                    name:       adUser.name,
                    email:      adUser.email,
                    role:       defaultRole,
                    authSource: "azure",
                    jobTitle:   "",
                    department: "",
                    manager:    ""
                });

                user = User.getByEmail(adUser.email);

                logAction({
                    action: "auto-created user from Azure AD login",
                    entity: "user",
                    entityId: user?.id,
                    targetName: adUser.name,
                    user: { id: 0, name: "System", role: "system" }
                });
            }

            if (!user) {
                return renderLogin("Failed to create your account. Please contact your administrator.");
            }

            if (user.auth_source !== "azure") {
                User.updateAuthSource(user.id, "azure");
            }

            return completeLogin(user, req, res);

        } catch (err) {
            console.error("Azure callback error:", err);
            renderLogin("Microsoft sign-in failed. Please try again.");
        }
    },

    // --------------------------------------------------
    // FORCED PASSWORD RESET (GET)
    // --------------------------------------------------
    showResetPassword(req, res) {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        res.render("reset-password", {
            user: req.session.user
        });
    },

    // --------------------------------------------------
    // FORCED PASSWORD RESET (POST)
    // --------------------------------------------------
    async resetPassword(req, res) {

        if (!req.session.user) {
            return res.redirect("/login");
        }

        const { password, confirm_password } = req.body;

        if (!password || password !== confirm_password) {
            return res.render("reset-password", {
                user: req.session.user,
                error: "Passwords do not match"
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        try {
            User.updatePasswordAndClearReset(req.session.user.id, hashed);
            req.session.user.must_reset_password = 0;
            res.redirect("/dashboard");
        } catch (err) {
            console.error("Password reset failed:", err);
            res.status(500).send("Password reset failed");
        }
    },

    // --------------------------------------------------
    // LOGOUT
    // --------------------------------------------------
    logout(req, res) {

        if (req.session?.user) {
            logAction({
                action: "logout",
                entity: "user",
                entityId: req.session.user.id,
                user: req.session.user
            });
        }

        req.session.destroy(() => {
            res.redirect("/login");
        });
    }
};

// ======================================================
// PRIVATE HELPERS
// ======================================================

function completeLogin(user, req, res) {
    req.session.user = {
        id:                  user.id,
        email:               user.email,
        name:                user.name,
        role:                user.role,
        must_reset_password: user.must_reset_password
    };

    req.session.save(() => {
        logAction({
            action: "login success",
            entity: "user",
            entityId: user.id,
            user: req.session.user
        });

        if (user.must_reset_password === 1) {
            return res.redirect("/reset-password");
        }

        res.redirect("/dashboard");
    });
}