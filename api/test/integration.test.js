import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { createApp, initializeDatabase } from "../app.js";

test("found items persist, can be collected, edited, and deleted", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DB_URL });
  await initializeDatabase(pool);
  const server = createApp(pool, "http://localhost:3000", "test").listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = (method, value) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  let id;
  try {
    assert.equal((await fetch(base + "/readyz")).status, 200);
    const preflight = await fetch(base + "/api/items", { method: "OPTIONS", headers: { Origin: "http://localhost:3000" } });
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
    const other = await fetch(base + "/api/items", { headers: { Origin: "https://other.example" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    const create = await fetch(base + "/api/items", body("POST", { name: "  Blue bottle  ", location: "Library reception" }));
    assert.equal(create.status, 201);
    const item = await create.json(); id = item.id;
    assert.equal(item.name, "Blue bottle"); assert.equal(item.collected, false);
    const saved = await pool.query("SELECT * FROM found_items WHERE id = $1", [id]);
    assert.equal(saved.rows[0].location, "Library reception");
    const items = await (await fetch(base + "/api/items")).json();
    assert.ok(items.some(row => row.id === id));
    const edited = { name: "Bottle'); DROP TABLE found_items; --", location: "Main desk", collected: true };
    const update = await fetch(base + `/api/items/${id}`, body("PUT", edited));
    assert.equal(update.status, 200);
    const updated = await update.json();
    assert.equal(updated.name, edited.name); assert.equal(updated.collected, true);
    assert.equal((await fetch(base + "/api/items", body("POST", { name: "", location: "Desk" }))).status, 400);
    assert.equal((await fetch(base + "/api/items", body("POST", { name: "a".repeat(101), location: "Desk" }))).status, 400);
    assert.equal((await fetch(base + `/api/items/${id}`, body("PUT", { name: "Bottle", location: "Desk", collected: "yes" }))).status, 400);
    assert.equal((await fetch(base + "/api/items/no", { method: "DELETE" })).status, 400);
    assert.equal((await fetch(base + `/api/items/${id}`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(base + `/api/items/${id}`, { method: "DELETE" })).status, 404);
    assert.equal((await pool.query("SELECT * FROM found_items WHERE id = $1", [id])).rowCount, 0);
  } finally {
    if (id) await pool.query("DELETE FROM found_items WHERE id = $1", [id]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
