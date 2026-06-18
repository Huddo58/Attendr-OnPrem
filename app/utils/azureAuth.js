// utils/azureAuth.js
// Handles Azure AD (Entra ID) authentication and Microsoft Graph API
// bulk user sync using @azure/msal-node.
//
// Two main jobs:
//   1. OAuth2 login flow (redirect → callback → get user info)
//   2. Bulk sync (fetch all users from Azure AD via Graph API)
 
const msal = require("@azure/msal-node");
const https = require("https");
const Settings = require("../models/settingsModel");
 
// ------------------------------------------------------
// Load Azure config from settings table
// Returns null if Azure AD is not enabled or not configured
// ------------------------------------------------------
function getAzureConfig() {
    const s = Settings.getByPrefix("ad_azure_");
 
    if (s.ad_azure_enabled !== "1") return null;
 
    const tenantId     = s.ad_azure_tenant_id     || "";
    const clientId     = s.ad_azure_client_id     || "";
    const clientSecret = s.ad_azure_client_secret || "";
    const redirectUri  = s.ad_azure_redirect_uri  || "";
 
    if (!tenantId || !clientId || !clientSecret || !redirectUri) return null;
 
    return { tenantId, clientId, clientSecret, redirectUri };
}
 
// ------------------------------------------------------
// Build an MSAL ConfidentialClientApplication
// This is the core Azure AD client
// ------------------------------------------------------
function buildMsalClient(config) {
    return new msal.ConfidentialClientApplication({
        auth: {
            clientId:     config.clientId,
            clientSecret: config.clientSecret,
            authority:    `https://login.microsoftonline.com/${config.tenantId}`
        }
    });
}
 
// ------------------------------------------------------
// STEP 1: Generate the Azure AD login URL
// Redirect the user's browser to this URL to start OAuth
// ------------------------------------------------------
async function getAuthCodeUrl(req) {
    const config = getAzureConfig();
    if (!config) throw new Error("Azure AD is not configured.");
 
    const client = buildMsalClient(config);
 
    const url = await client.getAuthCodeUrl({
        scopes:      ["openid", "profile", "email", "User.Read"],
        redirectUri: config.redirectUri
    });
 
    // Store the MSAL client in session so the callback can use it
    req.session.azureTenantId     = config.tenantId;
    req.session.azureClientId     = config.clientId;
    req.session.azureClientSecret = config.clientSecret;
    req.session.azureRedirectUri  = config.redirectUri;
 
    return url;
}
 
// ------------------------------------------------------
// STEP 2: Handle the callback from Azure
// Exchange the auth code for tokens and fetch the user's profile
// Returns: { name, email, azureId }
// ------------------------------------------------------
async function handleCallback(req) {
    const code = req.query.code;
    if (!code) throw new Error("No auth code returned from Azure.");
 
    const config = {
        tenantId:     req.session.azureTenantId,
        clientId:     req.session.azureClientId,
        clientSecret: req.session.azureClientSecret,
        redirectUri:  req.session.azureRedirectUri
    };
 
    if (!config.tenantId || !config.clientId) {
        throw new Error("Azure session config missing — please try logging in again.");
    }
 
    const client = buildMsalClient(config);
 
    const tokenResponse = await client.acquireTokenByCode({
        code,
        scopes:      ["openid", "profile", "email", "User.Read"],
        redirectUri: config.redirectUri
    });
 
    const account = tokenResponse.account;
 
    return {
        name:     account.name        || "",
        email:    account.username    || "",
        azureId:  account.homeAccountId || ""
    };
}
 
// ------------------------------------------------------
// GRAPH API HELPER
// Makes an authenticated call to Microsoft Graph API
// using client credentials (app-level, not user-level)
// ------------------------------------------------------
async function graphRequest(path, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "graph.microsoft.com",
            path:     `/v1.0${path}`,
            method:   "GET",
            headers:  {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        };
 
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error("Invalid JSON from Graph API"));
                }
            });
        });
 
        req.on("error", reject);
        req.end();
    });
}
 
// ------------------------------------------------------
// GET APP-LEVEL ACCESS TOKEN (for Graph API sync)
// Uses client credentials flow — no user interaction needed
// ------------------------------------------------------
async function getAppToken(config) {
    const client = buildMsalClient(config);
 
    const result = await client.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"]
    });
 
    return result.accessToken;
}
 
// ------------------------------------------------------
// BULK SYNC: Fetch all users from Azure AD
// Returns array of user objects with name, email,
// jobTitle, department, manager
// Requires Graph API permissions:
//   User.Read.All, Directory.Read.All (granted in Azure portal)
// ------------------------------------------------------
async function syncUsersFromAzure() {
    const config = getAzureConfig();
    if (!config) {
        return { ok: false, error: "Azure AD is not configured." };
    }
 
    try {
        const token = await getAppToken(config);
        const users = [];
        let nextUrl = "/users?$select=displayName,mail,userPrincipalName,jobTitle,department,manager&$top=100";
 
        // Handle pagination — Azure returns max 100 users per page
        while (nextUrl) {
            const page = await graphRequest(nextUrl, token);
 
            if (page.error) {
                return { ok: false, error: page.error.message };
            }
 
            for (const u of (page.value || [])) {
                // Skip accounts with no email (service accounts etc)
                const email = u.mail || u.userPrincipalName;
                if (!email) continue;
 
                users.push({
                    name:       u.displayName  || "",
                    email:      email.toLowerCase(),
                    jobTitle:   u.jobTitle     || "",
                    department: u.department   || "",
                    manager:    u.manager?.displayName || ""
                });
            }
 
            // Follow @odata.nextLink if there are more pages
            nextUrl = page["@odata.nextLink"]
                ? page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "")
                : null;
        }
 
        return { ok: true, users };
 
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
 
// ------------------------------------------------------
// TEST CONNECTION
// Quick check that the Azure config is valid and
// we can reach the Graph API
// ------------------------------------------------------
async function testAzureConnection() {
    const config = getAzureConfig();
    if (!config) {
        return { ok: false, error: "Azure AD is not configured or not enabled." };
    }
 
    try {
        const token = await getAppToken(config);
        const result = await graphRequest("/organization", token);
 
        if (result.error) {
            return { ok: false, error: result.error.message };
        }
 
        const orgName = result.value?.[0]?.displayName || "Unknown";
        return { ok: true, message: `Connected to: ${orgName}` };
 
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
 
module.exports = {
    getAuthCodeUrl,
    handleCallback,
    syncUsersFromAzure,
    testAzureConnection
};