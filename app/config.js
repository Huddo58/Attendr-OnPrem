const path = require("path");

module.exports = {
    mode: "onprem",   // or "saas"

    sqlite: {
        // 🔒 DB lives in /data folder at root
        filename: path.join(process.cwd(), "data", "attendr.db")
    },

    postgres: {
        user: "postgres",
        password: "",
        host: "localhost",
        port: 5432,
        database: "attendr"
    },

    sessionSecret: "attendr_secret_key_123"
};