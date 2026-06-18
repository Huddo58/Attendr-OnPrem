// middleware/licenseGuard.js
const License = require("../models/licenseModel");

function isMutation(req) {
    const m = (req.method || "").toUpperCase();
    return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function isSetupRoute(req) {
    return (
        req.originalUrl.startsWith("/setup") ||
        req.originalUrl.startsWith("/auth/setup")
    );
}

function isLicenseRoute(req) {
    return req.originalUrl.startsWith("/admin/settings/license");
}

// 🔓 Allow login/logout/auth routes even if licence expired
function isAuthRoute(req) {
    return (
        req.originalUrl.startsWith("/login") ||
        req.originalUrl.startsWith("/logout") ||
        req.originalUrl.startsWith("/auth")
    );
}

function licenseGuard(req, res, next) {

    // 🔓 ALWAYS allow setup
    if (isSetupRoute(req)) return next();

    // 🔓 ALWAYS allow authentication routes
    if (isAuthRoute(req)) return next();

    // 🔓 ALWAYS allow licence activation / management
    if (isLicenseRoute(req)) return next();

    let lic;

    try {
        lic = License.getCurrent();
        req.license = lic;
    } catch (err) {
        console.error("❌ License.getCurrent failed:", err);
        req.license = { valid: false, status: "unknown" };
    }

    // Non-mutating requests are always allowed
    if (!isMutation(req)) {
        return next();
    }

    // ✅ Allow writes ONLY when licence is valid
    if (lic && lic.valid) {
        return next();
    }

    // ❌ Licence expired / invalid → write frozen
    let frozen = false;

    try {
        frozen = License.isWriteFrozen();
    } catch (err2) {
        console.error("❌ Licence freeze check failed:", err2);
        return res.status(500).send("Licence check failed.");
    }

    if (!frozen) {
        return next();
    }

    // HTML → redirect with contextual message
    const accept = req.headers.accept || "";

    if (accept.includes("text/html")) {

        const back = req.get("Referrer") || "/dashboard";
        const url = new URL(back, `http://${req.headers.host}`);

        if (req.session?.user?.role === "admin") {
            url.searchParams.set("error", "license_expired_admin");
        } else {
            url.searchParams.set("error", "action_unavailable");
        }

        return res.redirect(
            url.toString().replace(`http://${req.headers.host}`, "")
        );
    }

    // API → JSON
    return res.status(403).json({
        error: "LICENCE_EXPIRED",
        message: "Licence expired. Renew to make changes."
    });
}

module.exports = licenseGuard;