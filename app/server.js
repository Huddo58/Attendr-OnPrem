// ===============================
// Attenddr Server
// ===============================
require("dotenv").config();
 
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("better-sqlite3-session-store")(session);
const Database = require("better-sqlite3");
const path = require("path");
const fs   = require("fs");
const config = require("./config");
 
// DB + INIT
const dbLayer      = require("./models/db");
const initDatabase = require("./models/init");
 
// GLOBAL MODELS
const Branding = require("./models/brandingModel");
const Settings = require("./models/settingsModel");
 
// JOBS
const dailyStatusReset = require("./jobs/dailyStatusReset");
 
// LICENSE MIDDLEWARE
const licenseGuard = require("./middleware/licenseGuard");
 
// Upload directory setup
const { ensureUploadDirs } = require("./utils/uploadMiddleware");
 
// ROUTES
const setupRoutes     = require("./routes/setup");
const authRoutes      = require("./routes/auth");
const adminRoutes     = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const statusRoutes    = require("./routes/status");
const kioskRoutes     = require("./routes/kiosk");
const adRoutes        = require("./routes/ad");
const profileRoutes   = require("./routes/profile");
 
const app  = express();
const PORT = process.env.PORT || 3000;
 
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");
 
// ===============================
// BRAND COLOUR HELPER
//
// Computes the light end of the gradient from the brand colour.
// Blends the brand colour 40% with the original Attenddr light
// blue #6ea0c8 at 60% — this closely matches the original app
// gradient top colour for the default navy, and scales well
// for any custom colour a customer picks.
//
// Default navy #0d2b4d → produces approx #4d7b96
// which is close to the original gradient top #6ea0c8
// ===============================
function lightenBrandColor(hex) {
    try {
        if (hex.toLowerCase() === "#0d2b4d") return "#6ea0c8";

        const clean = hex.replace("#", "");
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);

        // Lighten by mixing 45% with white
        const lr = Math.round(r + (255 - r) * 0.45);
        const lg = Math.round(g + (255 - g) * 0.45);
        const lb = Math.round(b + (255 - b) * 0.45);

        return "#" +
            lr.toString(16).padStart(2, "0") +
            lg.toString(16).padStart(2, "0") +
            lb.toString(16).padStart(2, "0");

    } catch {
        return "#6ea0c8";
    }
}
 
// ===============================
// DATABASE BOOTSTRAP
// ===============================
const db = dbLayer.db;
 
if (dbLayer.type === "sqlite") {
    try {
        db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        ).get();
 
        initDatabase();
        startServer();
    } catch (err) {
        console.error("DB check failed:", err);
        process.exit(1);
    }
} else {
    initDatabase();
    startServer();
}
 
// ===============================
// START SERVER
// ===============================
function startServer() {
 
    dailyStatusReset.startDailyStatusReset();
    ensureUploadDirs();
 
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
 
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
 
    // SESSION STORE
    const sessionDbPath = path.join(dataDir, "sessions.db");
    const sessionDb     = new Database(sessionDbPath);
 
    app.use(
        session({
            store: new SQLiteStore({ client: sessionDb }),
            secret:            config.sessionSecret,
            resave:            false,
            saveUninitialized: false,
            cookie: { maxAge: 1000 * 60 * 60 * 8 }
        })
    );
 
    // EXPOSE USER TO ALL VIEWS
    app.use((req, res, next) => {
        res.locals.user = req.session.user || null;
        next();
    });
 
    // EXPOSE QUERY TO ALL VIEWS
    app.use((req, res, next) => {
        res.locals.query = req.query || {};
        next();
    });
 
    // LICENSE GUARD
    app.use(licenseGuard);
 
    // EXPOSE LICENSE TO VIEWS
    app.use((req, res, next) => {
        res.locals.license = req.license || {
            valid:           false,
            max_users:       0,
            expires_at:      null,
            expires_in_days: null,
            masked_key:      null
        };
        next();
    });
 
    // ===============================
    // GLOBAL BRANDING (SYNC)
    // Computes brand_color_light server-side so views don't
    // need color-mix (which can vary between browsers).
    // ===============================
    app.use((req, res, next) => {
        try {
            const settings   = Branding.getSettings();
            const brandColor = (settings && settings.brand_color) || "#0d2b4d";
            const lightColor = lightenBrandColor(brandColor);
 
            res.locals.branding = {
                ...(settings || {}),
                brand_color:       brandColor,
                brand_color_light: lightColor,
                logo_path:         (settings && settings.logo_path) || null
            };
        } catch {
            res.locals.branding = {
                brand_color:       "#0d2b4d",
                brand_color_light: "#6ea0c8",
                logo_path:         null
            };
        }
        next();
    });
 
    // GLOBAL SETTINGS
    app.use((req, res, next) => {
        try {
            const settings = Settings.getAll();
            res.locals.settings = settings || {};
        } catch {
            res.locals.settings = {};
        }
        next();
    });
 
    // VIEW ENGINE
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));
 
    // STATIC FILES
    app.use(express.static(path.join(__dirname, "public"), {
        dotfiles: "deny",
        index:    false,
        setHeaders(res) {
            res.setHeader("X-Content-Type-Options", "nosniff");
        }
    }));
 
    // ROOT ENTRY POINT
    app.get("/", (req, res) => {
        const setupComplete = res.locals.settings?.setup_complete === "1";
        if (!setupComplete) return res.redirect("/setup");
        if (!req.session.user) return res.redirect("/login");
        return res.redirect("/dashboard");
    });
 
    // ROUTES
    app.use("/setup",              setupRoutes);
    app.use("/",                   authRoutes);
    app.use("/admin",              adminRoutes);
    app.use("/",                   statusRoutes);
    app.use("/",                   dashboardRoutes);
    app.use("/",                   kioskRoutes);
    app.use("/admin/integrations", adRoutes);
    app.use("/profile",            profileRoutes);
 
    app.listen(PORT, () => {
        console.log(`Attenddr running on http://0.0.0.0:${PORT}`);
    });
}
 