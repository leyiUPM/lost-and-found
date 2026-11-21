import pg from "pg";
import { createApp, initializeDatabase } from "./app.js";

if (!process.env.DB_URL) throw new Error("DB_URL is required");
const pool = new pg.Pool({
  connectionString: process.env.DB_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,
  max: 5, connectionTimeoutMillis: 5000, query_timeout: 5000,
});
pool.on("error", () => console.error(JSON.stringify({ event: "database_connection_error" })));
await initializeDatabase(pool);
const app = createApp(pool, process.env.CORS_ORIGIN || "http://localhost:3000", process.env.APP_VERSION || "dev");
const server = app.listen(Number(process.env.PORT || 8080), "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "api_started", port: Number(process.env.PORT || 8080) }));
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
