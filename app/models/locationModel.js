// models/locationModel.js
const dbLayer = require("./db");
const db = dbLayer.db;

module.exports = {

    // ---------------------------------------
    // GET ALL LOCATIONS
    // ---------------------------------------
    getAll(callback) {

        if (dbLayer.type === "sqlite") {
            return db.prepare(
                "SELECT * FROM locations ORDER BY name ASC"
            ).all();
        }

        else {
            db.query(
                "SELECT * FROM locations ORDER BY name ASC",
                callback
            );
        }
    },

    // ---------------------------------------
    // GET LOCATIONS WITH CIDR SET
    // ---------------------------------------
    getAllWithCidr() {
        return db.prepare(
            "SELECT * FROM locations WHERE cidr IS NOT NULL AND cidr != '' ORDER BY name ASC"
        ).all();
    },

    // ---------------------------------------
    // CREATE LOCATION
    // ---------------------------------------
    create(name, code, address, cidr, callback) {

        if (dbLayer.type === "sqlite") {
            const result = db.prepare(
                "INSERT INTO locations (name, code, address, cidr) VALUES (?, ?, ?, ?)"
            ).run(name, code, address, cidr || null);
            return { id: result.lastInsertRowid };
        }

        else {
            db.query(
                "INSERT INTO locations (name, code, address, cidr) VALUES ($1,$2,$3,$4) RETURNING id",
                [name, code, address, cidr || null],
                callback
            );
        }
    },

    // ---------------------------------------
    // ✅ NEW: UPDATE LOCATION NAME/CODE/ADDRESS
    // CIDR has its own updateCidr() function
    // ---------------------------------------
    update(id, name, code, address) {
        db.prepare(
            "UPDATE locations SET name = ?, code = ?, address = ? WHERE id = ?"
        ).run(name, code, address || "", id);
    },

    // ---------------------------------------
    // UPDATE CIDR ON AN EXISTING LOCATION
    // ---------------------------------------
    updateCidr(id, cidr) {
        db.prepare(
            "UPDATE locations SET cidr = ? WHERE id = ?"
        ).run(cidr || null, id);
    },

    // ---------------------------------------
    // DELETE LOCATION
    // ---------------------------------------
    delete(id, callback) {

        if (dbLayer.type === "sqlite") {
            db.prepare(
                "DELETE FROM locations WHERE id = ?"
            ).run(id);
            return;
        }

        else {
            db.query(
                "DELETE FROM locations WHERE id=$1",
                [id],
                callback
            );
        }
    }
};
