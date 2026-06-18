// utils/ldapAuth.js
// Handles on-premise Active Directory authentication and bulk user sync
// using ldapjs.
//
// Functions:
//   1. authenticateUser    — verify credentials via LDAP bind
//   2. syncUsersFromLdap   — bulk sync by OU
//   3. syncUsersByGroups   — bulk sync by AD group membership
//   4. browseGroups        — list available AD groups for the picker
//   5. previewGroupSync    — count users in selected groups without importing
//   6. testLdapConnection  — verify connection settings

const ldap = require("ldapjs");
const Settings = require("../models/settingsModel");

// ------------------------------------------------------
// Load LDAP config from settings table
// ------------------------------------------------------
function getLdapConfig() {
    const s = Settings.getByPrefix("ad_ldap_");

    if (s.ad_ldap_enabled !== "1") return null;

    const url             = s.ad_ldap_url             || "";
    const port            = parseInt(s.ad_ldap_port || "389", 10);
    const baseDn          = s.ad_ldap_base_dn         || "";
    const serviceDn       = s.ad_ldap_service_dn      || "";
    const servicePassword = s.ad_ldap_service_password || "";
    const userAttribute   = s.ad_ldap_user_attribute  || "userPrincipalName";
    const syncOu          = s.ad_ldap_sync_ou         || "";
    const syncGroups      = s.ad_ldap_sync_groups     || "";
    const syncMode        = s.ad_ldap_sync_mode       || "ou";

    if (!url || !baseDn || !serviceDn || !servicePassword) return null;

    return {
        url, port, baseDn, serviceDn, servicePassword,
        userAttribute, syncOu, syncGroups, syncMode
    };
}

// ------------------------------------------------------
// Create an LDAP client
// ------------------------------------------------------
function createClient(config) {
    return ldap.createClient({
        url:            `${config.url}:${config.port}`,
        timeout:        5000,
        connectTimeout: 5000,
        reconnect:      false
    });
}

// ------------------------------------------------------
// Escape values before inserting them into LDAP filters.
// Prevents special chars such as *, (, ), \ and NUL from
// changing the meaning of user, group, or search filters.
// ------------------------------------------------------
function escapeLdapFilterValue(value) {
    return String(value || "").replace(/[\0()*\\]/g, (char) => {
        switch (char) {
            case "\0": return "\\00";
            case "(":  return "\\28";
            case ")":  return "\\29";
            case "*":  return "\\2a";
            case "\\": return "\\5c";
            default:   return char;
        }
    });
}

// ------------------------------------------------------
// Bind helper
// ------------------------------------------------------
function bindClient(client, dn, password) {
    return new Promise((resolve, reject) => {
        client.bind(dn, password, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ------------------------------------------------------
// Search helper
// ✅ FIXED: use attr.values || attr.vals to handle ldapjs
//    deprecation of .vals in newer versions.
// ✅ FIXED: extract DN as string from entry.objectName
//    which may be an object rather than a plain string.
// ------------------------------------------------------
function searchClient(client, base, options) {
    return new Promise((resolve, reject) => {
        const entries = [];

        client.search(base, options, (err, res) => {
            if (err) return reject(err);

            res.on("searchEntry", (entry) => {
                const obj = {};

                for (const attr of entry.attributes) {
                    // ✅ Support both old (.vals) and new (.values) ldapjs API
                    const vals = attr.values || attr.vals || [];
                    obj[attr.type] = vals.length === 1 ? vals[0] : vals;
                }

                // ✅ Extract DN as a plain string — objectName may be an object
                const raw = entry.objectName;
                if (raw === null || raw === undefined) {
                    obj.dn = "";
                } else if (typeof raw === "string") {
                    obj.dn = raw;
                } else if (typeof raw.toString === "function") {
                    obj.dn = raw.toString();
                } else {
                    obj.dn = "";
                }

                entries.push(obj);
            });

            res.on("error", reject);
            res.on("end", () => resolve(entries));
        });
    });
}

// ------------------------------------------------------
// Extract manager name from a DN string
// e.g. "CN=John Smith,OU=Staff,DC=company,DC=local" -> "John Smith"
// ------------------------------------------------------
function extractCn(dn) {
    if (!dn) return "";
    const match = dn.match(/^CN=([^,]+)/i);
    return match ? match[1] : "";
}

// ------------------------------------------------------
// Map an LDAP entry to a clean user object
// ------------------------------------------------------
function mapUser(entry) {
    const email = entry.mail || entry.userPrincipalName;
    if (!email) return null;

    return {
        name:       entry.displayName  || "",
        email:      email.toLowerCase(),
        jobTitle:   entry.title        || entry.jobTitle || "",
        department: entry.department   || "",
        manager:    extractCn(entry.manager || "")
    };
}

// Common user attributes to fetch
const USER_ATTRS = [
    "displayName", "mail", "userPrincipalName",
    "title", "department", "manager"
];

// ------------------------------------------------------
// 1. AUTHENTICATE USER VIA LDAP
// ------------------------------------------------------
async function authenticateUser(email, password) {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured." };
    }

    const client = createClient(config);

    try {
        // Bind as service account to find the user
        await bindClient(client, config.serviceDn, config.servicePassword);

        const searchFilter = `(${config.userAttribute}=${escapeLdapFilterValue(email)})`;
        const entries = await searchClient(client, config.baseDn, {
            scope:      "sub",
            filter:     searchFilter,
            attributes: ["dn", ...USER_ATTRS]
        });

        if (!entries || entries.length === 0) {
            client.destroy();
            return { ok: false, error: "User not found in Active Directory." };
        }

        const userEntry = entries[0];
        const userDn    = userEntry.dn;

        if (!userDn) {
            client.destroy();
            return { ok: false, error: "Could not determine user DN from Active Directory." };
        }

        client.unbind();

        // Bind as the user to verify password
        const userClient = createClient(config);

        try {
            await bindClient(userClient, userDn, password);
            userClient.unbind();

            return {
                ok:         true,
                name:       userEntry.displayName        || "",
                email:      userEntry.mail               || userEntry.userPrincipalName || email,
                jobTitle:   userEntry.title              || userEntry.jobTitle || "",
                department: userEntry.department         || "",
                manager:    extractCn(userEntry.manager  || "")
            };

        } catch (bindErr) {
            userClient.destroy();
            console.error("LDAP user bind error:", {
                code:    bindErr.code,
                message: bindErr.message,
                dn:      userDn
            });
            if (bindErr.code === 49) {
                return { ok: false, error: "Invalid password." };
            }
            return { ok: false, error: bindErr.message };
        }

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

// ------------------------------------------------------
// 2. SYNC USERS BY OU
// Searches the configured OU for all enabled user accounts
// ------------------------------------------------------
async function syncUsersFromLdap() {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured or not enabled." };
    }

    const client = createClient(config);

    try {
        await bindClient(client, config.serviceDn, config.servicePassword);

        const searchBase = config.syncOu || config.baseDn;

        const entries = await searchClient(client, searchBase, {
            scope:      "sub",
            filter:     "(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
            attributes: USER_ATTRS
        });

        client.unbind();

        const users = entries
            .map(mapUser)
            .filter(Boolean);

        return { ok: true, users };

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

// ------------------------------------------------------
// 3. SYNC USERS BY AD GROUPS
// Looks up each group by CN, finds its members,
// then fetches full user details for each member.
// Deduplicates across groups by email.
// ------------------------------------------------------
async function syncUsersByGroups(groupNames) {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured or not enabled." };
    }

    if (!groupNames || groupNames.length === 0) {
        return { ok: false, error: "No groups specified." };
    }

    const client = createClient(config);

    try {
        await bindClient(client, config.serviceDn, config.servicePassword);

        const userMap = new Map(); // keyed by email to deduplicate

        for (const groupName of groupNames) {
            const trimmed = groupName.trim();
            if (!trimmed) continue;

            try {
                const escapedGroupName = escapeLdapFilterValue(trimmed);
                const groupEntries = await searchClient(client, config.baseDn, {
                    scope:      "sub",
                    filter:     `(&(objectClass=group)(cn=${escapedGroupName}))`,
                    attributes: ["dn", "member", "cn"]
                });

                if (!groupEntries || groupEntries.length === 0) {
                    console.warn(`AD group not found: ${trimmed}`);
                    continue;
                }

                const group = groupEntries[0];

                // member attribute can be a single DN string or array of DNs
                let members = group.member || [];
                if (typeof members === "string") members = [members];

                // Fetch each member's details
                for (const memberDn of members) {
                    if (!memberDn) continue;

                    try {
                        const userEntries = await searchClient(client, memberDn, {
                            scope:      "base",
                            filter:     "(objectClass=user)",
                            attributes: USER_ATTRS
                        });

                        if (userEntries && userEntries.length > 0) {
                            const mapped = mapUser(userEntries[0]);
                            if (mapped && !userMap.has(mapped.email)) {
                                userMap.set(mapped.email, mapped);
                            }
                        }
                    } catch {
                        // Skip members that can't be resolved (e.g. deleted accounts)
                    }
                }

            } catch (err) {
                console.warn(`Error processing group ${trimmed}:`, err.message);
            }
        }

        client.unbind();

        return { ok: true, users: Array.from(userMap.values()) };

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

// ------------------------------------------------------
// 4. BROWSE GROUPS
// Returns a list of AD groups for the picker UI.
// Searches the base DN for all group objects.
// Returns name and member count for each group.
// ------------------------------------------------------
async function browseGroups(searchTerm) {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured or not enabled." };
    }

    const client = createClient(config);

    try {
        await bindClient(client, config.serviceDn, config.servicePassword);

        const escapedSearchTerm = escapeLdapFilterValue((searchTerm || "").trim());
        const filter = escapedSearchTerm
            ? `(&(objectClass=group)(cn=*${escapedSearchTerm}*))`
            : "(objectClass=group)";

        const entries = await searchClient(client, config.baseDn, {
            scope:      "sub",
            filter,
            attributes: ["cn", "member", "description"]
        });

        client.unbind();

        const groups = entries.map(e => {
            let memberCount = 0;
            if (e.member) {
                memberCount = Array.isArray(e.member) ? e.member.length : 1;
            }

            return {
                name:        e.cn          || "",
                description: e.description || "",
                memberCount
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        return { ok: true, groups };

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

// ------------------------------------------------------
// 5. PREVIEW GROUP SYNC
// Returns user count per group without importing anything.
// Used to show the admin a summary before confirming.
// ------------------------------------------------------
async function previewGroupSync(groupNames) {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured or not enabled." };
    }

    if (!groupNames || groupNames.length === 0) {
        return { ok: false, error: "No groups specified." };
    }

    const client = createClient(config);

    try {
        await bindClient(client, config.serviceDn, config.servicePassword);

        const preview   = [];
        const allEmails = new Set();

        for (const groupName of groupNames) {
            const trimmed = groupName.trim();
            if (!trimmed) continue;

            try {
                const escapedGroupName = escapeLdapFilterValue(trimmed);
                const groupEntries = await searchClient(client, config.baseDn, {
                    scope:      "sub",
                    filter:     `(&(objectClass=group)(cn=${escapedGroupName}))`,
                    attributes: ["dn", "member", "cn"]
                });

                if (!groupEntries || groupEntries.length === 0) {
                    preview.push({ group: trimmed, memberCount: 0, found: false });
                    continue;
                }

                const group = groupEntries[0];
                let members = group.member || [];
                if (typeof members === "string") members = [members];

                let groupUniqueCount = 0;
                for (const memberDn of members) {
                    if (!memberDn) continue;
                    try {
                        const userEntries = await searchClient(client, memberDn, {
                            scope:      "base",
                            filter:     "(objectClass=user)",
                            attributes: ["mail", "userPrincipalName"]
                        });
                        if (userEntries && userEntries.length > 0) {
                            const email = (
                                userEntries[0].mail ||
                                userEntries[0].userPrincipalName ||
                                ""
                            ).toLowerCase();
                            if (email && !allEmails.has(email)) {
                                allEmails.add(email);
                                groupUniqueCount++;
                            }
                        }
                    } catch {}
                }

                preview.push({
                    group:       trimmed,
                    memberCount: members.length,
                    uniqueNew:   groupUniqueCount,
                    found:       true
                });

            } catch (err) {
                preview.push({ group: trimmed, found: false, error: err.message });
            }
        }

        client.unbind();

        return { ok: true, preview, totalUnique: allEmails.size };

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

// ------------------------------------------------------
// 6. TEST CONNECTION
// ------------------------------------------------------
async function testLdapConnection() {
    const config = getLdapConfig();
    if (!config) {
        return { ok: false, error: "LDAP is not configured or not enabled." };
    }

    const client = createClient(config);

    try {
        await bindClient(client, config.serviceDn, config.servicePassword);

        const entries = await searchClient(client, config.baseDn, {
            scope:      "base",
            filter:     "(objectClass=*)",
            attributes: ["dn"]
        });

        client.unbind();

        if (entries.length > 0) {
            return {
                ok:      true,
                message: `Connected to ${config.url} — base DN verified.`
            };
        } else {
            return {
                ok:    false,
                error: "Connected but base DN returned no results. Check your Base DN setting."
            };
        }

    } catch (err) {
        client.destroy();
        return { ok: false, error: err.message };
    }
}

module.exports = {
    authenticateUser,
    syncUsersFromLdap,
    syncUsersByGroups,
    browseGroups,
    previewGroupSync,
    testLdapConnection
};