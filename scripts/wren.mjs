// One-command Wren (Seldon QA) runner over the hosted MCP server.
//   node scripts/wren.mjs run https://<public-url>      → dispatches seldon.yml, prints experiment id
//   node scripts/wren.mjs report <experiment_id>        → prints the per-case ledger
//   node scripts/wren.mjs status <experiment_id>        → prints run status
//   node scripts/wren.mjs runs                          → lists recent runs
import fs from "node:fs";

const KEY = process.env.SELDON_API_KEY ?? "seldon_86edc37eb75f07c64ae41bd9df2ba4c6";
const MCP = "https://app.seldon.com/mcp";

async function call(name, args = {}) {
  const r = await fetch(MCP, {
    method: "POST",
    headers: { "X-API-Key": KEY, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await r.text();
  // Server answers as SSE; pull the JSON out of the data: line(s).
  const data = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("");
  const json = JSON.parse(data || text);
  if (json.error) throw new Error(JSON.stringify(json.error));
  const content = json.result?.content ?? [];
  return content.map((c) => c.text ?? JSON.stringify(c)).join("\n");
}

const [cmd, arg] = process.argv.slice(2);
const yml = fs.readFileSync(new URL("../seldon.yml", import.meta.url), "utf8");

switch (cmd) {
  case "validate":
    console.log(await call("validate_seldon_yaml", { seldon_yaml: yml }));
    break;
  case "run":
    if (!arg) throw new Error("usage: run <public-url>");
    console.log(await call("run_seldon", { seldon_yaml: yml, url: arg, name: "loft", lineage_key: "loft", labels: ["hackathon"] }));
    break;
  case "status":
    console.log(await call("get_experiment_status", { experiment_id: arg }));
    break;
  case "report":
    console.log(await call("get_report", { experiment_id: arg, full: true }));
    break;
  case "logs":
    console.log(await call("get_run_logs", { experiment_id: arg, include_actions: true }));
    break;
  case "runs":
    console.log(await call("list_baseline_runs"));
    break;
  default:
    console.log("commands: validate | run <url> | status <id> | report <id> | logs <id> | runs");
}
