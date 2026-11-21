import express from "express";

export async function initializeDatabase(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS found_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(120) NOT NULL,
    collected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export function createApp(pool, origin, version = "dev") {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => console.log(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - start })));
    res.set("Vary", "Origin");
    if (req.get("Origin") === origin) res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  app.get("/livez", (req, res) => res.json({ status: "alive" }));
  app.get("/readyz", async (req, res) => {
    try { await pool.query("SELECT 1"); res.json({ status: "ready" }); }
    catch { res.status(503).json({ error: "Database unavailable" }); }
  });
  app.get("/api/message", (req, res) => res.json({ message: "Lost and Found API", version }));
  app.get("/api/items", async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM found_items ORDER BY collected, id DESC");
    res.json(rows);
  });
  function validateItem(req, res, next) {
    for (const [field, max] of [["name", 100], ["location", 120]]) {
      if (typeof req.body?.[field] !== "string" || !req.body[field].trim() || req.body[field].trim().length > max) {
        return res.status(400).json({ error: `${field === "name" ? "Item" : "Location"} must contain 1-${max} characters.` });
      }
      req.body[field] = req.body[field].trim();
    }
    next();
  }
  app.param("id", (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return res.status(400).json({ error: "Invalid item ID." });
    next();
  });
  app.post("/api/items", validateItem, async (req, res) => {
    const { rows } = await pool.query("INSERT INTO found_items (name, location) VALUES ($1, $2) RETURNING *", [req.body.name, req.body.location]);
    res.status(201).json(rows[0]);
  });
  app.put("/api/items/:id", validateItem, async (req, res) => {
    if (typeof req.body.collected !== "boolean") return res.status(400).json({ error: "Collected must be true or false." });
    const { rows } = await pool.query("UPDATE found_items SET name = $1, location = $2, collected = $3 WHERE id = $4 RETURNING *", [req.body.name, req.body.location, req.body.collected, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Item not found." });
    res.json(rows[0]);
  });
  app.delete("/api/items/:id", async (req, res) => {
    const result = await pool.query("DELETE FROM found_items WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Item not found." });
    res.sendStatus(204);
  });
  app.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request too large." });
    console.error(JSON.stringify({ event: "request_failed", code: err.code || "INTERNAL_ERROR" }));
    res.status(500).json({ error: "The request could not be completed." });
  });
  return app;
}
