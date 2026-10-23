import { createServer } from "node:http";
import { Pool } from "pg";
import { createOrderHttpHandler } from "./create-order-http.ts";
import { postgresTransactionManager } from "../orders/order-transactions.ts";
import { validateOrderSigningDomain } from "../orders/signature.ts";

// Explicit opt-in server startup; does NOT run database migrations or deployments.
// Listen only on loopback by default; an operator must separately configure a reverse proxy.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be configured");
const domain = validateOrderSigningDomain({
  chainId: Number(process.env.PERPDEX_CHAIN_ID),
  verifyingContract: process.env.PERPDEX_VERIFYING_CONTRACT ?? "",
});
const port = Number(process.env.PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1..65535");

const pool = new Pool({ connectionString: databaseUrl });
const server = createServer(createOrderHttpHandler({
  trustedDomain: domain,
  transactions: postgresTransactionManager(pool),
  readDatabase: pool,
}));

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`PerpDEX order API listening on 127.0.0.1:${port}\n`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
