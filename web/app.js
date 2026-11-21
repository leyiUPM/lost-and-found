const apiUrl = window.APP_CONFIG.apiUrl.replace(/\/$/, "");
const list = document.querySelector("#items");
const status = document.querySelector("#status");
const form = document.querySelector("#item-form");

async function request(path, options = {}) {
  const response = await fetch(apiUrl + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}
function actionButton(label, action) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "secondary"; button.textContent = label;
  button.onclick = async () => {
    button.disabled = true;
    try { await action(); } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  return button;
}
async function update(item, changes) {
  await request(`/api/items/${item.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: item.name, location: item.location, collected: item.collected, ...changes }),
  });
  await loadItems();
}
async function loadItems() {
  const items = await request("/api/items");
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement("li");
    const name = document.createElement("h3"); name.textContent = item.name;
    const location = document.createElement("p"); location.textContent = `Collect from: ${item.location}`;
    const state = document.createElement("p"); state.className = item.collected ? "collected" : "waiting";
    state.textContent = item.collected ? "Collected" : "Waiting for owner";
    const date = document.createElement("time"); date.dateTime = item.created_at;
    date.textContent = new Date(item.created_at).toLocaleDateString();
    const actions = document.createElement("div"); actions.className = "actions";
    actions.append(
      actionButton(item.collected ? "Mark waiting" : "Mark collected", async () => {
        await update(item, { collected: !item.collected }); status.textContent = "Status updated.";
      }),
      actionButton("Edit", async () => {
        const name = window.prompt("Item", item.name);
        if (name === null) return;
        const location = window.prompt("Where to collect", item.location);
        if (location === null) return;
        await update(item, { name, location }); status.textContent = "Item updated.";
      }),
      actionButton("Delete", async () => {
        if (!window.confirm("Delete this item?")) return;
        await request(`/api/items/${item.id}`, { method: "DELETE" });
        await loadItems(); status.textContent = "Item deleted.";
      }),
    );
    row.append(name, location, state, date, actions); list.append(row);
  }
  status.textContent = items.length ? `${items.filter(item => !item.collected).length} waiting for their owner.` : "No items listed yet.";
}
form.onsubmit = async event => {
  event.preventDefault();
  const button = form.querySelector("button"); button.disabled = true;
  try {
    await request("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.elements.name.value, location: form.elements.location.value }) });
    form.reset(); await loadItems(); status.textContent = "Item added.";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
document.querySelector("#refresh").onclick = () => loadItems().catch(error => { status.textContent = error.message; });
loadItems().catch(() => { status.textContent = "Cannot reach the API. Try Refresh in a moment."; });
