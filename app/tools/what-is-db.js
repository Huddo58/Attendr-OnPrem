const db = require("../models/db");

console.log("🔍 DB MODULE CONTENTS:");
console.log(db);

if (db.db) {
    console.log("\n👉 db.db exists. Type:", typeof db.db);
}

if (db.database) {
    console.log("\n👉 db.database exists. Type:", typeof db.database);
}

if (db.run) {
    console.log("\n👉 db.run exists! You can call db.run directly.");
}

console.log("\nDone.");
