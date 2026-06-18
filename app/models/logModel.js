// models/logModel.js
const dbLayer = require("./db");
const db = dbLayer.db;

module.exports = {

    getRecent(limit = 100, callback) {

        // ---------------------------------
        // SQLITE (SYNC)
        // ---------------------------------
        if (dbLayer.type === "sqlite") {

            const sql = `
                SELECT
                    l.*,

                    u.name AS user_name,
                    u.role AS user_role,

                    COALESCE(
                        l.target_name,
                        CASE l.entity
                            WHEN 'user' THEN tu.name
                            WHEN 'department' THEN d.name
                            WHEN 'location' THEN loc.name
                            WHEN 'status' THEN s.name
                            ELSE NULL
                        END
                    ) AS target_name

                FROM logs l

                LEFT JOIN users u
                    ON u.id = l.user_id

                LEFT JOIN users tu
                    ON tu.id = CAST(l.entity_id AS INTEGER)
                   AND l.entity = 'user'

                LEFT JOIN departments d
                    ON d.id = CAST(l.entity_id AS INTEGER)
                   AND l.entity = 'department'

                LEFT JOIN locations loc
                    ON loc.id = CAST(l.entity_id AS INTEGER)
                   AND l.entity = 'location'

                LEFT JOIN statuses s
                    ON s.id = CAST(l.entity_id AS INTEGER)
                   AND l.entity = 'status'

                ORDER BY l.timestamp DESC
                LIMIT ?
            `;

            return db.prepare(sql).all(limit);
        }

        // ---------------------------------
        // POSTGRES (UNCHANGED)
        // ---------------------------------
        else {

            const pgSql = `
                SELECT
                    l.*,

                    u.name AS user_name,
                    u.role AS user_role,

                    COALESCE(
                        l.target_name,
                        CASE l.entity
                            WHEN 'user' THEN tu.name
                            WHEN 'department' THEN d.name
                            WHEN 'location' THEN loc.name
                            WHEN 'status' THEN s.name
                            ELSE NULL
                        END
                    ) AS target_name

                FROM logs l

                LEFT JOIN users u
                    ON u.id = l.user_id

                LEFT JOIN users tu
                    ON tu.id = l.entity_id::int
                   AND l.entity = 'user'

                LEFT JOIN departments d
                    ON d.id = l.entity_id::int
                   AND l.entity = 'department'

                LEFT JOIN locations loc
                    ON loc.id = l.entity_id::int
                   AND l.entity = 'location'

                LEFT JOIN statuses s
                    ON s.id = l.entity_id::int
                   AND l.entity = 'status'

                ORDER BY l.timestamp DESC
                LIMIT $1
            `;

            db.query(pgSql, [limit], (err, result) =>
                callback(err, result?.rows)
            );
        }
    }
};
