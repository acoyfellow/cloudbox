#!/usr/bin/env node
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_PERSONAL_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_PERSONAL_API_TOKEN;
const stateToken = process.env.ALCHEMY_STATE_TOKEN;
const scriptName = process.env.ALCHEMY_STATE_SCRIPT ?? "cloudbox-state";
const action = process.argv[2];
const key = process.argv[3] ?? process.argv[2];
if (!accountId || !token || !stateToken || !key) {
  console.error("usage: ... node scripts/alchemy-state-delete.mjs [delete|get|list] <key>");
  process.exit(2);
}
const subdomainRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers: { authorization: `Bearer ${token}` } });
const subdomainJson = await subdomainRes.json();
const subdomain = subdomainJson.result?.subdomain;
if (!subdomain) throw new Error(`could not resolve worker subdomain: ${JSON.stringify(subdomainJson)}`);
const url = `https://${scriptName}.${subdomain}.workers.dev`;
const method = action === "get" ? "get" : action === "list" ? "list" : "delete";
const params = method === "list" ? [] : [key];
const body = { method, params, context: { chain: ["cloudbox", "prod"] } };
const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${stateToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const text = await res.text();
console.log(res.status, text);
if (!res.ok || !text.includes('"success":true')) process.exit(1);
