// models/licenseModel.js
const crypto = require("crypto");
const dbLayer = require("./db");
const db = dbLayer.db;

// ====== PUBLIC KEY (RSA) ======
const LICENSE_PUBLIC_KEY_PEM = `
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuiMkHFthv4ouTfqIFOtc
9XdZuhN/jK+CEqeoHofJPdcjfc49deaiWX0RtpZLL8Hq0gN0q537eqaVsimuCN0V
OhRoMzpECDl9sZx7oWVOtk/DaFDhx5Z2IM5zg54lnRAz7gMYM9Z0HP08Lggq0GvP
PVQ+LUUtMqzjo+Vbixa8TUhR16qvDDThfzVJC2+duvSd9gHSp/2T4oHAUM6FB5nw
k/DoHjSWwC54bdvJ9o5oCOQEIbKfrvs5ipMItWb786pqK5xt8yGqGfRiErZdSDkR
Qu+YjoeOD5z0J3/gvXQB4RR0a5fjAaLEto92Qf79IFqTzi3zxslLaVMA5aruMsr7
dwIDAQAB
-----END PUBLIC KEY-----
`;

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function sha256(s) {
    return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function base64urlToBuf(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return Buffer.from(s, "base64");
}

// --------------------------------------------------
// VERIFY LICENCE STRING
// --------------------------------------------------
function verifyLicenseString(licenseKey) {

    const parts = String(licenseKey || "").trim().split(".");
    if (parts.length !== 2) {
        return { ok: false, error: "Invalid licence format." };
    }

    const payloadPart = parts[0];
    const sigPart = parts[1];

    let sigBuf;
    try {
        sigBuf = base64urlToBuf(sigPart);
    } catch {
        return { ok: false, error: "Invalid licence encoding." };
    }

    // ----- RSA SIGNATURE VERIFY -----
    try {

        const verify = crypto.createVerify("RSA-SHA256");
        verify.update(payloadPart);
        verify.end();

        const valid = verify.verify(
            LICENSE_PUBLIC_KEY_PEM,
            sigBuf
        );

        if (!valid) {
            return { ok: false, error: "Licence signature invalid." };
        }

    } catch (err) {
        return { ok: false, error: "Licence verification failed." };
    }

    // ----- DECODE PAYLOAD -----
    try {

        const payload = JSON.parse(
            base64urlToBuf(payloadPart).toString("utf8")
        );

        return { ok: true, payload };

    } catch {
        return { ok: false, error: "Invalid licence payload." };
    }
}

// --------------------------------------------------
// ACTIVATE LICENCE
// --------------------------------------------------
function activateLicenseKey(licenseKey) {

    const verified = verifyLicenseString(licenseKey);
    if (!verified.ok) return verified;

    const payload = verified.payload;

    const instanceRow = db.prepare(
        `SELECT value FROM settings WHERE key='instance_id'`
    ).get();

    if (!instanceRow || instanceRow.value !== payload.instance_id) {
        return {
            ok: false,
            error: "Instance ID mismatch."
        };
    }

    const licenseHash = sha256(licenseKey);

    db.prepare(
        `UPDATE licenses SET status='replaced' WHERE status IN ('active','trial')`
    ).run();

    db.prepare(`
        INSERT INTO licenses (
            license_hash,
            license_key,
            tier,
            max_users,
            issued_at,
            activated_at,
            expires_at,
            status,
            instance_id
        )
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, 'active', ?)
    `).run(
        licenseHash,
        licenseKey,
        payload.tier,
        payload.max_users,
        payload.expires_at,
        payload.instance_id
    );

    return { ok: true, valid: true };
}

// --------------------------------------------------
// GET CURRENT LICENCE
// --------------------------------------------------
function getCurrent() {

    const row = db.prepare(`
        SELECT *
        FROM licenses
        ORDER BY
            CASE status
                WHEN 'active' THEN 1
                WHEN 'trial' THEN 2
                ELSE 3
            END,
            activated_at DESC
        LIMIT 1
    `).get();

    if (!row) {
        return {
            valid: false,
            status: "none"
        };
    }

    let expiresInDays = null;

    if (row.expires_at) {
        const msLeft = new Date(row.expires_at) - new Date();
        expiresInDays = Math.max(
            0,
            Math.ceil(msLeft / (1000 * 60 * 60 * 24))
        );
    }

    const expired = expiresInDays !== null && expiresInDays <= 0;

    if (row.tier === "trial") {
        return {
            valid: !expired,
            status: expired ? "expired" : "trial",
            tier: "trial",
            max_users: row.max_users,
            expires_at: row.expires_at,
            expires_in_days: expiresInDays,
            masked_key: "-"
        };
    }

    if (expired) {
        return {
            valid: false,
            status: "expired"
        };
    }

    let maskedKey = "-";
    if (row.license_key) {
        const k = row.license_key.trim();
        maskedKey = "XXXX-XXXX-XXXX-" + k.slice(-4);
    }

    return {
        valid: true,
        status: "active",
        tier: row.tier,
        max_users: row.max_users,
        expires_at: row.expires_at,
        expires_in_days: expiresInDays,
        masked_key: maskedKey
    };
}

// --------------------------------------------------
// WRITE FREEZE
// --------------------------------------------------
function isWriteFrozen() {
    const lic = getCurrent();
    return lic.status === "expired";
}

// --------------------------------------------------
// CAN ADD USER
// --------------------------------------------------
function canAddUser() {

    const lic = getCurrent();

    if (lic.status === "expired") {
        return { allowed: false, reason: "Licence expired" };
    }

    if (!lic.max_users) {
        return { allowed: true };
    }

    const row = db.prepare(
        `SELECT COUNT(*) AS count FROM users WHERE is_system = 0 AND is_active = 1`
    ).get();

    if (row.count >= lic.max_users) {
        return {
            allowed: false,
            reason: `User limit reached (${lic.max_users})`
        };
    }

    return { allowed: true };
}

module.exports = {
    verifyLicenseString,
    activateLicenseKey,
    getCurrent,
    isWriteFrozen,
    canAddUser
};