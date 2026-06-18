// utils/detectLocation.js
// Pure Node.js CIDR matching. Compares a client IP against all configured
// location CIDR ranges and returns the matching location, or null.
 
const Location = require("../models/locationModel");
 
function ipToInt(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}
 
function cidrContains(cidr, ip) {
    try {
        const [range, bits] = cidr.split("/");
        const mask = bits ? ~((1 << (32 - parseInt(bits, 10))) - 1) >>> 0 : 0xFFFFFFFF;
        const rangeInt = ipToInt(range) & mask;
        const ipInt    = ipToInt(ip)    & mask;
        return rangeInt === ipInt;
    } catch {
        return false;
    }
}
 
//  FIXED: Check X-Forwarded-For header first so real client IP
// is used when Attenddr sits behind a proxy or reverse proxy.
// req.ip alone often returns the server's own address.
function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}
 
function normaliseIp(ip) {
    if (!ip) return null;
    if (ip.startsWith("::ffff:")) return ip.slice(7);
    return ip;
}
 
function detectLocationFromRequest(req) {
    try {
        const rawIp = getClientIp(req);
        const ip    = normaliseIp(rawIp);
 
        if (!ip) return null;
 
        if (ip.includes(":")) return null;
 
        const locations = Location.getAllWithCidr();
 
        for (const loc of locations) {
            const ranges = loc.cidr.split(",").map(r => r.trim()).filter(Boolean);
 
            for (const range of ranges) {
                if (cidrContains(range, ip)) {
                    return loc;
                }
            }
        }
 
        return null;
    } catch (err) {
        console.error("detectLocation error:", err.message);
        return null;
    }
}
 
module.exports = { detectLocationFromRequest, getClientIp, normaliseIp };