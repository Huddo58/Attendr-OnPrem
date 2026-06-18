// models/departmentModel.js
const dbLayer = require("./db");
const db = dbLayer.db;

module.exports = {

    // ---------------------------------------
    // GET ALL DEPARTMENTS
    // ---------------------------------------
    getAll(callback) {

        if (dbLayer.type === "sqlite") {
            return db.prepare(
                "SELECT * FROM departments ORDER BY name ASC"
            ).all();
        }

        else {
            db.query(
                "SELECT * FROM departments ORDER BY name ASC",
                callback
            );
        }
    },

    // ---------------------------------------
    // CREATE DEPARTMENT
    // ---------------------------------------
    create(name, code, description, callback) {

        if (dbLayer.type === "sqlite") {
            const result = db.prepare(
                "INSERT INTO departments (name, code, description) VALUES (?, ?, ?)"
            ).run(name, code, description);
            return { id: result.lastInsertRowid };
        }

        else {
            db.query(
                "INSERT INTO departments (name, code, description) VALUES ($1,$2,$3) RETURNING id",
                [name, code, description],
                callback
            );
        }
    },

    // ---------------------------------------
    // ✅ NEW: UPDATE DEPARTMENT
    // ---------------------------------------
    update(id, name, code, description) {
        db.prepare(
            "UPDATE departments SET name = ?, code = ?, description = ? WHERE id = ?"
        ).run(name, code, description || "", id);
    },

    // ---------------------------------------
    // DELETE DEPARTMENT
    // ---------------------------------------
    delete(id, callback) {

        if (dbLayer.type === "sqlite") {
            db.prepare(
                "DELETE FROM departments WHERE id = ?"
            ).run(id);
            return;
        }

        else {
            db.query(
                "DELETE FROM departments WHERE id=$1",
                [id],
                callback
            );
        }
    }
};
