/* Link board: Outcomes (lists) -> Capabilities (sticky notes) -> Deliverables (small notes) -> Tasks (checklist).
 * Links are many-to-many. Each link is written on the PARENT side (parent's RefList order = display order);
 * Grist's two-way references keep the child side in sync. */
"use strict";

// ---- Column names: adjust here if you rename things in Grist -------------------------------------
const CFG = {
  O: {
    table: "Outcomes",
    name: "Outcome",
    children: "Capabilities",
    impact: "Impact",
  },
  C: {
    table: "Capabilities",
    name: "Capability",
    children: "Deliverables",
    parents: "Outcomes",
    note: "Review_Note",
    proposed: "Proposed_By",
    status: "Status",
  },
  D: {
    table: "Deliverables",
    name: "Deliverable",
    children: "Tasks",
    parents: "Capabilities",
    note: "Review_Note",
    status: "Status",
    urgency: "Urgency",
  },
  T: {
    table: "Tasks",
    name: "Task",
    parents: "Deliverables",
    status: "Status",
    effort: "Effort",
    urgency: "Urgency",
  },
};
// Capabilities and Deliverables have Impact/Effort (shown), *_Rollup (formula) and *_Estimate (entered).
// Editable fields in the side pane, per level: [column, label, kind]
const STATUSES = ["Not Started", "In Progress", "Review", "Done"];
const CAP_STATUSES = ["Not Started", "In Progress", "Available"]; // "Available" counts as done
// kind: "number", "urgency", or a list of choices
const FIELDS = {
  O: [["Impact", "Impact", "number"]],
  C: [
    ["Status", "Status", CAP_STATUSES],
    ["Impact_Estimate", "Impact estimate", "number"],
    ["Effort_Estimate", "Effort estimate", "number"],
  ],
  D: [
    ["Status", "Status", STATUSES],
    ["Urgency", "Urgency", "urgency"],
    ["Impact_Estimate", "Impact estimate", "number"],
    ["Effort_Estimate", "Effort estimate", "number"],
  ],
};
const URGENCY = ["", "Elevated", "High"]; // blank = normal
const CHILD = { O: "C", C: "D", D: "T" };
const PARENT = { C: "O", D: "C", T: "D" };
const LABEL = { O: "outcome", C: "capability", D: "deliverable", T: "task" };
const PLURAL = {
  O: "outcomes",
  C: "capabilities",
  D: "deliverables",
  T: "tasks",
};
const plural = (n, type) => `${n} ${n === 1 ? LABEL[type] : PLURAL[type]}`;
const DONE = "Done",
  NOT_STARTED = "Not Started",
  AVAILABLE = "Available";

const api = window.GRIST_MOCK || grist;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const refs = (v) => (Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : []);

let S = { O: new Map(), C: new Map(), D: new Map(), T: new Map() };
const ekey = (out, cap) => `${out}:${cap}`; // expanded state is per copy (outcome:capability)
const ui = {
  expanded: new Set(),
  sel: null,
  clip: null,
  pane: null,
  drag: null,
  busy: false,
  draft: null, // name being typed in place: {type, parent, text} for a new record, plus id to rename a task
  confirm: null, // {type, id} of the item whose delete is waiting for confirmation
  showAll: false, // pool shows every item, not just unlinked ones ("Hide linked" unticked)
};

// ---- Data ------------------------------------------------------------------------------------------
async function load() {
  const tabs = await Promise.all(
    ["O", "C", "D", "T"].map((k) => api.docApi.fetchTable(CFG[k].table)),
  );
  const next = {};
  ["O", "C", "D", "T"].forEach((k, i) => {
    const t = tabs[i],
      m = new Map();
    t.id.forEach((id, r) => {
      const row = { id };
      for (const col in t) if (col !== "id") row[col] = t[col][r];
      m.set(id, {
        id,
        row,
        name: row[CFG[k].name] || "(untitled)",
        kids: CHILD[k] ? refs(row[CFG[k].children]) : [],
        parents: [],
      });
    });
    next[k] = m;
  });
  for (const k of ["O", "C", "D"]) {
    // derive parents from parent-side lists, drop dangling refs
    for (const p of next[k].values()) {
      p.kids = p.kids.filter((id) => next[CHILD[k]].has(id));
      p.kids.forEach((id) => next[CHILD[k]].get(id).parents.push(p.id));
    }
  }
  const pos = (x) => x.row.manualSort ?? x.id; // row order in Grist; used for outcome lists and the pool
  for (const k in next)
    next[k] = new Map(
      [...next[k].values()]
        .sort((a, b) => pos(a) - pos(b))
        .map((x) => [x.id, x]),
    );
  S = next;
}

async function refresh(force) {
  // polling skips while you're dragging or typing; our own writes force it
  if (
    !force &&
    (ui.drag ||
      ui.busy ||
      document.activeElement?.matches(
        "input:not([type=checkbox]), select, textarea",
      ))
  )
    return;
  try {
    await load();
    render();
    $("#status").textContent = "";
  } catch (e) {
    $("#status").textContent = "Couldn't read the tables: " + (e.message || e);
  }
}

async function act(actions, msg) {
  ui.busy = true;
  try {
    await api.docApi.applyUserActions(actions);
    if (msg) toast(msg);
  } catch (e) {
    toast("Change failed: " + (e.message || e));
  } finally {
    ui.busy = false;
  }
  await refresh(true);
}

const kidsOf = (type, parent) =>
  // children of a parent; parent 0 = the pool (unlinked items, or all of them)
  parent
    ? [...S[PARENT[type]].get(parent).kids]
    : [...S[type].values()]
        .filter((x) => ui.showAll || !x.parents.length)
        .map((x) => x.id);
const setKids = (type, parent, list) => [
  "UpdateRecord",
  CFG[PARENT[type]].table,
  parent,
  { [CFG[PARENT[type]].children]: ["L", ...list] },
];
const nameOf = (type, id) => (id ? S[type].get(id)?.name : "the pool");
// names of the pool's stand-in notes for deliverables and tasks
const poolName = (type) =>
  ui.showAll
    ? `All ${PLURAL[type]}`
    : {
        D: "Deliverables without a capability",
        T: "Tasks without a deliverable",
      }[type];

// Pool items have no parent list, so their order is the table's row order (manualSort).
function rowOrder(type, id, beforeId) {
  const all = [...S[type].keys()].filter((x) => x !== id),
    loose = kidsOf(type, 0).filter((x) => x !== id);
  let at = all.indexOf(beforeId);
  if (at < 0)
    at = loose.length ? all.indexOf(loose[loose.length - 1]) + 1 : all.length;
  all.splice(at, 0, id);
  return [
    "BulkUpdateRecord",
    CFG[type].table,
    all,
    { manualSort: all.map((_, i) => i + 1) },
  ];
}

function move(type, id, from, to, index, beforeId) {
  const acts = [];
  if (!to) acts.push(rowOrder(type, id, beforeId));
  if (from === to) {
    if (!to) return act(acts);
    const list = kidsOf(type, to),
      old = list.indexOf(id);
    list.splice(old, 1);
    list.splice(index > old ? index - 1 : index, 0, id);
    acts.push(setKids(type, to, list));
  } else {
    if (from)
      acts.push(
        setKids(
          type,
          from,
          kidsOf(type, from).filter((x) => x !== id),
        ),
      );
    if (to) {
      const list = kidsOf(type, to);
      if (!list.includes(id)) {
        list.splice(Math.min(index, list.length), 0, id);
        acts.push(setKids(type, to, list));
      }
    }
  }
  if (acts.length)
    act(
      acts,
      `${from ? "Moved" : "Linked"} “${nameOf(type, id)}” to “${nameOf(PARENT[type], to)}”.`, // from the pool = a new link
    );
}

function link(type, id, to) {
  const list = kidsOf(type, to);
  if (list.includes(id))
    return toast(
      `“${nameOf(type, id)}” is already on “${nameOf(PARENT[type], to)}”.`,
    );
  act(
    [setKids(type, to, [...list, id])],
    `Linked “${nameOf(type, id)}” to “${nameOf(PARENT[type], to)}”.`,
  );
}

function unlink(type, id, from) {
  if (!from) return;
  act(
    [
      setKids(
        type,
        from,
        kidsOf(type, from).filter((x) => x !== id),
      ),
    ],
    `Removed “${nameOf(type, id)}” from “${nameOf(PARENT[type], from)}”.`,
  );
}

// Save the in-place draft: add the new record, or rename the task. A blank or unchanged name just closes it.
function saveDraft() {
  const d = ui.draft,
    name = d.text.trim();
  ui.draft = null;
  if (!name || (d.id && name === S.T.get(d.id)?.name)) return render();
  if (d.id)
    return act([["UpdateRecord", CFG.T.table, d.id, { [CFG.T.name]: name }]]);
  const fields = { [CFG[d.type].name]: name };
  if (d.parent) fields[CFG[d.type].parents] = ["L", d.parent];
  act([["AddRecord", CFG[d.type].table, null, fields]], `Added “${name}”.`);
}

// Items that would be left with no parent if (type, id) were deleted, per level: {C: [ids], D: [...], ...}.
// Something also linked to a parent that stays is kept.
function below(type, id) {
  const gone = { [type]: [id] };
  for (let p = type, k = CHILD[type]; k; p = k, k = CHILD[k])
    gone[k] = [...S[k].values()]
      .filter(
        (x) => x.parents.length && x.parents.every((q) => gone[p].includes(q)),
      )
      .map((x) => x.id);
  return gone;
}

function remove({ type, id }, withBelow) {
  const gone = withBelow ? below(type, id) : { [type]: [id] },
    n = Object.values(gone).flat().length - 1;
  ui.confirm = null;
  act(
    Object.entries(gone)
      .filter(([, ids]) => ids.length)
      .map(([k, ids]) => ["BulkRemoveRecord", CFG[k].table, ids]),
    `Deleted “${nameOf(type, id)}”${n ? ` and ${n} item${n === 1 ? "" : "s"} below it` : ""}.`,
  );
}

// ---- Rendering -------------------------------------------------------------------------------------
const q = () => $("#search").value.trim().toLowerCase();
const hideDone = () => $("#hideDone").checked;
const matches = (x) => !q() || x.name.toLowerCase().includes(q());
const doneOf = (x) => (x.row[CFG.D.status] || x.row[CFG.T.status]) === DONE;
const visible = (x) => !(hideDone() && doneOf(x));
// true if any shown task (by id) matches the filter; lets a deliverable be found by its tasks
const taskHit = (ids) =>
  ids.some((t) => visible(S.T.get(t)) && matches(S.T.get(t)));
const hit = (d) => matches(d) || taskHit(d.kids);
const copies = (x, level) =>
  x.parents.length > 1
    ? `<span class="copies" title="On ${plural(x.parents.length, PARENT[level])}">×${x.parents.length}</span>`
    : "";
const num = (v) =>
  v === null || v === undefined || v === "" || typeof v === "object" ? null : v;
const fmt = (v) => (Number.isInteger(v) ? v : +v.toFixed(1));
function measure(x, m) {
  // "Impact 16", or "Impact ~8" when it's only an estimate
  const v = num(x.row?.[m]);
  if (v === null) return "";
  const est = m + "_Rollup" in x.row && num(x.row[m + "_Rollup"]) === null;
  return `<span title="${est ? "Estimate" : "From linked items"}">${m} ${est ? "≈" : ""}${fmt(v)}</span>`;
}
const metrics = (x) => {
  const m = [measure(x, "Impact"), measure(x, "Effort")].filter(Boolean);
  return m.length
    ? `<div class="metrics">${m.join('<span class="dot">·</span>')}</div>`
    : "";
};
const urgRank = (u) => URGENCY.indexOf(u || "");
const urgAttr = (u) => (u ? ` data-urgency="${esc(u)}"` : "");
const paneIs = (type, id) => ui.pane?.type === type && ui.pane.id === id;

const TRASH = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/></svg>`;
function confirmHTML({ type, id }) {
  // "Delete X?" with the choice to also delete what's only linked under it
  const x = S[type].get(id),
    gone = below(type, id);
  const more = Object.entries(gone)
    .filter(([k, ids]) => k !== type && ids.length)
    .map(([k, ids]) => plural(ids.length, k))
    .join(", ");
  const where =
    x.parents.length > 1
      ? ` It's on ${plural(x.parents.length, PARENT[type])}.`
      : "";
  return `<div class="confirm"><span>Delete “${esc(x.name)}”?${where}</span>
    ${
      more
        ? `<button class="danger" data-go="one" title="What's under it moves to the pool">Delete only this</button>
      <button class="danger" data-go="all">Delete with ${more}</button>`
        : `<button class="danger" data-go="all">Delete</button>`
    }
    <button data-cancel>Cancel</button></div>`;
}
const confirming = (type, id) =>
  ui.confirm?.type === type && ui.confirm.id === id;

const draftHTML = (label, text = "") =>
  `<textarea class="draft" rows="1" placeholder="New ${label}" aria-label="Name">${esc(text)}</textarea>`;
function addHTML(type, parent) {
  // "+ Add ..." button, or the new note being named in its place
  const d = ui.draft;
  if (d && !d.id && d.type === type && d.parent === parent) {
    const box = draftHTML(LABEL[type], d.text);
    return {
      O: `<section class="lane"><div class="lane-head">${box}</div></section>`,
      C: `<div class="cap">${box}</div>`,
      D: `<div class="del">${box}</div>`,
    }[type];
  }
  return `<button class="${type === "O" ? "add-lane" : "add"}" data-add="${type}" data-parent="${parent}">+ Add ${LABEL[type]}</button>`;
}

function delHTML(d, cap) {
  const tasks = d.kids.map((t) => S.T.get(t)),
    done = tasks.filter(doneOf).length;
  const st = d.row[CFG.D.status] || "";
  return `<div class="del${paneIs("D", d.id) ? " open" : ""}" draggable="true" tabindex="0" data-type="D" data-id="${d.id}" data-parent="${cap}" data-status="${esc(st)}"${urgAttr(d.row[CFG.D.urgency])}>
    ${esc(d.name)}${copies(d, "D")}
    <div class="meta">${tasks.length ? `<span>${done}/${tasks.length} tasks</span>` : ""}${st ? `<span>${esc(st)}</span>` : ""}</div>${metrics(d)}
    ${cap ? `<button class="x" data-unlink title="Remove from this capability" aria-label="Remove from this capability">×</button>` : ""}</div>`;
}

function capHTML(c, out) {
  const special = c.id === 0;
  const dels = c.kids.map((d) => S.D.get(d)).filter(visible);
  const shown = dels.filter(hit);
  const orphanT = special ? kidsOf("T", 0) : [];
  const orphanHit = taskHit(orphanT);
  const filtering = q() && !matches(c); // card is only here for its matching deliverables/tasks
  if (filtering && !shown.length && !orphanHit) return "";
  const cst = special ? "" : c.row[CFG.C.status] || "";
  if (hideDone() && cst === AVAILABLE) return "";
  const open = ui.expanded.has(ekey(out, c.id)) || !!filtering;
  const list = filtering ? shown : dels;
  const urg = dels
    .filter((d) => !doneOf(d))
    .map((d) => d.row[CFG.D.urgency])
    .sort((x, y) => urgRank(y) - urgRank(x))[0];
  return `<div class="cap${special ? " special" : ""}${paneIs("C", c.id) && !special ? " open" : ""}" ${special ? "" : 'draggable="true"'} tabindex="0" data-type="C" data-id="${c.id}" data-parent="${out}"${urgAttr(urg)}>
    <div class="cap-title"><button class="chev" data-toggle aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"}">${open ? "▾" : "▸"}</button>${esc(c.name)}</div>
    ${special ? "" : copies(c, "C")}
    <div class="meta"><span>${dels.length} deliverable${dels.length === 1 ? "" : "s"}</span>

      ${cst ? `<span class="pill${cst === AVAILABLE ? " ok" : ""}">${cst === AVAILABLE ? "✓ " : ""}${esc(cst)}</span>` : ""}
      ${c.row?.[CFG.C.proposed] ? `<span class="pill">${esc(c.row[CFG.C.proposed])}</span>` : ""}</div>
    ${special ? "" : metrics(c)}
    ${
      open
        ? `<div class="dels" data-drop="D" data-parent="${special ? 0 : c.id}">${list.map((d) => delHTML(d, special ? 0 : c.id)).join("")}
      ${orphanT.length && (!filtering || orphanHit) ? `<div class="del orphan${paneIs("D", 0) ? " open" : ""}" tabindex="0" data-type="D" data-id="0" data-parent="0">${poolName("T")} (${orphanT.length})</div>` : ""}
      ${special ? "" : addHTML("D", c.id)}</div>`
        : ""
    }
    ${out && !special ? `<button class="x" data-unlink title="Remove from this outcome" aria-label="Remove from this outcome">×</button>` : ""}</div>`;
}

function laneHTML(o) {
  const id = o ? o.id : 0;
  let caps = kidsOf("C", id).map((c) => S.C.get(c));
  if (!o) {
    // the pool: capabilities + a stand-in card holding the pool's deliverables
    const orphanD = kidsOf("D", 0);
    caps.push({
      id: 0,
      name: poolName("D"),
      kids: orphanD,
      parents: [],
      row: {},
    });
  }
  const imp = o && num(o.row[CFG.O.impact]);
  const open = o && paneIs("O", o.id);
  return `<section class="lane${o ? "" : " unlinked"}">
    <div class="lane-head${open ? " open" : ""}" tabindex="0" data-type="O" data-id="${id}" data-parent="0"${o ? ' draggable="true" title="Drag to reorder"' : ""}>${o ? esc(o.name) : "Pool"}
      <span class="sub">${o ? `${o.kids.length} capabilit${o.kids.length === 1 ? "y" : "ies"}${imp !== null && imp !== undefined ? ` · impact ${imp}` : ""}` : `Drag notes here to unlink them <label class="toggle"><input type="checkbox" data-hidelinked${ui.showAll ? "" : " checked"}> Hide linked</label>`}</span></div>
    <div class="lane-body" data-drop="C" data-parent="${id}">${caps.map((c) => capHTML(c, id)).join("")}
      ${addHTML("C", id)}</div></section>`;
}

function render() {
  const board = $("#board"),
    scroll = [...board.querySelectorAll(".lane-body")].map((e) => e.scrollTop),
    left = board.scrollLeft;
  board.innerHTML =
    laneHTML(null) + [...S.O.values()].map(laneHTML).join("") + addHTML("O", 0);
  board
    .querySelectorAll(".lane-body")
    .forEach((e, i) => (e.scrollTop = scroll[i] || 0));
  board.scrollLeft = left;
  if (ui.sel) {
    const el = findEl(ui.sel);
    if (el) el.classList.add("selected");
    else ui.sel = null;
  }
  renderPane();
  if (ui.sel && document.activeElement === document.body)
    findEl(ui.sel)?.focus({ preventScroll: true }); // re-render dropped focus; keep arrow keys working
  const draft = $(".draft");
  if (draft && document.activeElement !== draft) {
    grow(draft);
    draft.focus();
    draft.setSelectionRange(draft.value.length, draft.value.length);
  }
}

function renderPane() {
  const pane = $("#pane"),
    p = ui.pane;
  const x = !p
    ? null
    : p.type === "D" && p.id === 0
      ? {
          id: 0,
          name: poolName("T"),
          kids: kidsOf("T", 0),
          parents: [],
          row: {},
        }
      : S[p.type].get(p.id);
  document.body.classList.toggle("pane-open", !!x);
  if (!x) {
    pane.hidden = true;
    ui.pane = null;
    return;
  }
  pane.hidden = false;
  const L = p.type,
    note = x.row[CFG[L].note];
  const field = ([col, label, kind]) => {
    const v = x.row[col] ?? "";
    let input;
    if (kind === "number")
      input = `<input type="number" step="any" data-field="${col}" value="${esc(v)}">`;
    else {
      const list = Array.isArray(kind),
        opts = list
          ? [...kind, ...(v && !kind.includes(v) ? [v] : [])]
          : URGENCY;
      input = `<select data-field="${col}">${list && !v ? `<option value="" selected></option>` : ""}${opts
        .map(
          (o) =>
            `<option value="${esc(o)}"${o === v ? " selected" : ""}>${esc(o || "Normal")}</option>`,
        )
        .join("")}</select>`;
    }
    return `<label class="field"><span>${label}</span>${input}</label>`;
  };
  const sum = [measure(x, "Impact"), measure(x, "Effort")]
    .filter(Boolean)
    .join(" · ");
  let html = `<div class="pane-head"><div class="kind">${LABEL[L]}</div>${x.id ? `<textarea class="title" data-field="${CFG[L].name}" rows="1" aria-label="Name">${esc(x.row[CFG[L].name] ?? "")}</textarea>` : `<h2>${esc(x.name)}</h2>`}
      <button class="x" data-close aria-label="Close">×</button>
      ${x.parents.length ? `<div class="chips">${x.parents.map((q) => `<span class="chip">${esc(nameOf(PARENT[L], q))}</span>`).join("")}</div>` : ""}
      ${L !== "O" && sum ? `<div class="summary">${sum}</div>` : ""}
      ${x.id && FIELDS[L] ? `<div class="fields">${FIELDS[L].map(field).join("")}</div>` : ""}
      ${note ? `<div class="pane-note">${esc(note)}</div>` : ""}</div>`;
  if (L === "D") {
    const tasks = x.kids.map((t) => S.T.get(t)).filter(visible);
    html += `<div class="tasks" data-drop="T" data-parent="${x.id}">
      ${
        tasks
          .map((t) => {
            const u = t.row[CFG.T.urgency] || "";
            if (confirming("T", t.id))
              return `<div class="task" data-type="T" data-id="${t.id}" data-parent="${x.id}">${confirmHTML(ui.confirm)}</div>`;
            return `<div class="task${doneOf(t) ? " done" : ""}${q() && matches(t) ? " hit" : ""}" draggable="true" tabindex="0" data-type="T" data-id="${t.id}" data-parent="${x.id}">
        <input type="checkbox" data-check ${doneOf(t) ? "checked" : ""} aria-label="Done">
        ${ui.draft?.id === t.id ? draftHTML(LABEL.T, ui.draft.text) : `<span class="name">${esc(t.name)}</span>`}
        <button class="urg" data-urg data-u="${esc(u)}" title="Urgency: ${esc(u || "Normal")} (click to change)" aria-label="Urgency: ${esc(u || "Normal")}"></button>
        <input class="teff" type="number" step="any" data-teffort value="${esc(num(t.row[CFG.T.effort]) ?? "")}" placeholder="effort" aria-label="Effort">
        <button class="trash" data-delete title="Delete task" aria-label="Delete task">${TRASH}</button>
        ${copies(t, "T")}${x.id ? `<button class="x" data-unlink title="Remove from this deliverable" aria-label="Remove from this deliverable">×</button>` : ""}</div>`;
          })
          .join("") || `<div class="empty">No tasks yet.</div>`
      }</div>
      ${x.id ? `<form data-addtask><input type="text" placeholder="Add a task and press Enter" aria-label="New task"></form>` : ""}`;
  }
  if (x.id)
    html += `<div class="pane-foot">${confirming(L, x.id) ? confirmHTML(ui.confirm) : `<button class="danger-link" data-delete>Delete ${LABEL[L]}</button>`}</div>`;
  pane.innerHTML = html;
  const title = $("textarea.title", pane);
  if (title) grow(title);
}
const grow = (el) => {
  // fit a textarea's height to its text
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

function findEl(sel) {
  const sc = sel.type === "T" ? $("#pane") : $("#board");
  return (
    sc.querySelector(
      `[data-type="${sel.type}"][data-id="${sel.id}"][data-parent="${sel.parent}"]`,
    ) || (sel.type === "O" ? $(`#board .lane-head[data-id="${sel.id}"]`) : null)
  );
}
const noteOf = (el) => el?.closest("[data-type]");
const selOf = (el) => ({
  type: el.dataset.type,
  id: +el.dataset.id,
  parent: +(el.dataset.parent || 0),
});

// Arrow keys: up/down through a list's visible notes (or the side pane's tasks), left/right to the
// nearest note at the same height in the next list.
function arrow(key, el) {
  const notes = (scope) => [...scope.querySelectorAll("[data-type]")];
  let next;
  if (key === "ArrowUp" || key === "ArrowDown") {
    const list = notes(el.closest(".tasks, .lane"));
    next = list[list.indexOf(el) + (key === "ArrowDown" ? 1 : -1)];
  } else if (!el.closest("#pane")) {
    const lanes = [...document.querySelectorAll("#board .lane")].filter(
        (l) => notes(l).length,
      ),
      lane =
        lanes[
          lanes.indexOf(el.closest(".lane")) + (key === "ArrowRight" ? 1 : -1)
        ],
      y = el.getBoundingClientRect().top,
      dist = (n) => Math.abs(n.getBoundingClientRect().top - y);
    next = lane && notes(lane).reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }
  if (next) {
    next.focus();
    select(next);
  }
}

// ---- Interaction -----------------------------------------------------------------------------------
function select(el) {
  document
    .querySelectorAll(".selected")
    .forEach((e) => e.classList.remove("selected"));
  ui.sel = el ? selOf(el) : null;
  el?.classList.add("selected");
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 3200);
}

document.addEventListener("click", (e) => {
  const t = e.target,
    note = noteOf(t);
  if (t.closest("[data-close]")) {
    ui.pane = null;
    render();
    return;
  }
  if (t.closest("[data-delete]")) {
    // a task's trash button, or the pane's Delete button
    ui.confirm = t.closest(".task")
      ? { type: "T", id: +note.dataset.id }
      : { ...ui.pane };
    return render();
  }
  if (t.closest("[data-cancel]")) {
    ui.confirm = null;
    return render();
  }
  if (t.closest("[data-go]"))
    return remove(ui.confirm, t.closest("[data-go]").dataset.go === "all");
  if (t.closest("[data-urg]")) {
    const u = t.closest("[data-urg]").dataset.u,
      next = URGENCY[(urgRank(u) + 1) % URGENCY.length];
    return act([
      [
        "UpdateRecord",
        CFG.T.table,
        +note.dataset.id,
        { [CFG.T.urgency]: next || null },
      ],
    ]);
  }
  if (t.closest(".pane-head, .teff")) return;
  if (t.closest(".draft")) return;
  if (t.closest("[data-add]")) {
    const b = t.closest("[data-add]");
    ui.draft = {
      type: b.dataset.add,
      parent: +b.dataset.parent || 0,
      text: "",
    };
    return render();
  }
  if (t.closest("[data-toggle]")) {
    const k = ekey(+note.dataset.parent, +note.dataset.id);
    ui.expanded.has(k) ? ui.expanded.delete(k) : ui.expanded.add(k);
    select(note);
    render();
    return;
  }
  if (t.closest("[data-unlink]")) {
    const s = selOf(note);
    return unlink(s.type, s.id, s.parent);
  }
  if (t.matches("[data-check]")) {
    const id = +note.dataset.id,
      done = t.checked;
    return act([
      [
        "UpdateRecord",
        CFG.T.table,
        id,
        { [CFG.T.status]: done ? DONE : NOT_STARTED },
      ],
    ]);
  }
  if (note) {
    select(note);
    const s = selOf(note);
    if (s.type === "C" && s.id === 0) {
      ui.expanded.add(ekey(0, 0));
      render();
    } else if (s.type !== "T" && (s.id || s.type === "D")) {
      ui.pane = { type: s.type, id: s.id };
      ui.confirm = null;
      render();
    }
  } else if (t.closest("#board")) select(null);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const val = () =>
    el.type === "number"
      ? el.value === ""
        ? null
        : +el.value
      : el.value || null;
  if (el.matches("[data-hidelinked]")) {
    ui.showAll = !el.checked;
    return render();
  }
  if (el.matches("textarea.title") && !el.value.trim()) return renderPane(); // don't allow blank names
  if (el.matches("[data-field]") && ui.pane)
    act([
      [
        "UpdateRecord",
        CFG[ui.pane.type].table,
        ui.pane.id,
        { [el.dataset.field]: val() },
      ],
    ]);
  else if (el.matches("[data-teffort]"))
    act([
      [
        "UpdateRecord",
        CFG.T.table,
        +noteOf(el).dataset.id,
        { [CFG.T.effort]: val() },
      ],
    ]);
});

document.addEventListener("input", (e) => {
  // grow the name box as you type
  if (e.target.matches("textarea.title, .draft")) grow(e.target);
  if (e.target.matches(".draft")) ui.draft.text = e.target.value;
});

document.addEventListener("dblclick", (e) => {
  // double-click a task to rename it
  const n = e.target.closest(".task .name");
  if (!n) return;
  const id = +noteOf(n).dataset.id;
  ui.draft = { type: "T", id, text: S.T.get(id)?.name ?? "" };
  render();
});

document.addEventListener("focusout", (e) => {
  // leaving the draft saves it; switching to another window (document loses focus) keeps it open
  if (e.target.matches(".draft") && ui.draft && document.hasFocus())
    saveDraft();
});

document.addEventListener("submit", (e) => {
  if (!e.target.matches("[data-addtask]")) return;
  e.preventDefault();
  const input = $("input", e.target),
    name = input.value.trim();
  if (!name || !paneIs("D", ui.pane?.id) || !ui.pane.id) return;
  input.value = "";
  act([
    [
      "AddRecord",
      CFG.T.table,
      null,
      { [CFG.T.name]: name, [CFG.T.parents]: ["L", ui.pane.id] },
    ],
  ]).then(() => $("#pane form input")?.focus());
});

// Hovering a note outlines its other copies.
document.addEventListener("mouseover", (e) => {
  const n = noteOf(e.target);
  document.querySelectorAll(".twin").forEach((x) => x.classList.remove("twin"));
  if (!n || n.dataset.type === "O" || !+n.dataset.id) return;
  document
    .querySelectorAll(
      `[data-type="${n.dataset.type}"][data-id="${n.dataset.id}"]`,
    )
    .forEach((x) => {
      if (x !== n) x.classList.add("twin");
    });
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches(".draft")) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur(); // saves, via focusout
    } else if (e.key === "Escape") {
      ui.draft = null;
      render();
    }
    return;
  }
  if (e.target.matches("textarea.title") && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
    return;
  }
  if (e.target.matches("textarea.title") && e.key === "Escape") {
    renderPane();
    return;
  }
  if (e.target.matches("input, select, textarea")) return;
  const mod = e.ctrlKey || e.metaKey,
    s = ui.sel;
  if (mod && e.key === "c" && s && s.type !== "O" && s.id) {
    ui.clip = { type: s.type, id: s.id };
    const where = {
      C: "an outcome list",
      D: "a capability",
      T: "a deliverable",
    }[s.type];
    toast(
      `Copied “${nameOf(s.type, s.id)}”. Select ${where} and press ${e.metaKey ? "⌘" : "Ctrl+"}V.`,
    );
    e.preventDefault();
  } else if (mod && e.key === "v" && ui.clip) {
    const c = ui.clip,
      want = PARENT[c.type];
    let target = null;
    if (c.type === "T" && ui.pane?.type === "D" && ui.pane.id)
      target = ui.pane.id;
    else if (s?.type === want) target = s.id;
    else if (s?.type === c.type) target = s.parent;
    if (!target)
      return toast(
        `Select ${{ O: "an outcome list", C: "a capability", D: "a deliverable" }[want]} to paste into.`,
      );
    link(c.type, c.id, target);
    e.preventDefault();
  } else if (
    (e.key === "Delete" || e.key === "Backspace") &&
    s &&
    s.type !== "O" &&
    s.parent
  ) {
    unlink(s.type, s.id, s.parent);
    e.preventDefault();
  } else if (e.key.startsWith("Arrow")) {
    const cur = noteOf(e.target) || (ui.sel && findEl(ui.sel));
    if (cur) arrow(e.key, cur);
    else {
      // nothing selected yet: start at the first note
      const first = $("#board [data-type]");
      first.focus();
      select(first);
    }
    e.preventDefault();
  } else if (e.key === " " && e.target.matches("[data-type]")) {
    // Space: expand/collapse a capability, open/close a deliverable's side pane
    const s = selOf(e.target);
    if (s.type === "C") {
      const k = ekey(s.parent, s.id);
      ui.expanded.has(k) ? ui.expanded.delete(k) : ui.expanded.add(k);
    } else if (s.type === "D")
      ui.pane = paneIs("D", s.id) ? null : { type: "D", id: s.id };
    else return;
    select(e.target);
    render();
    e.preventDefault();
  } else if (e.key === "Escape") {
    select(null);
    ui.pane = null;
    ui.confirm = null;
    render();
  } else if (e.key === "Enter" && e.target.matches("[data-type]")) {
    e.target.click();
  }
});

// ---- Drag and drop (move) --------------------------------------------------------------------------
let marker = null;
function clearDrop() {
  marker?.remove();
  marker = null;
  document
    .querySelectorAll(".drop-into")
    .forEach((x) => x.classList.remove("drop-into"));
}

function dropTarget(e) {
  const d = ui.drag;
  if (!d) return null;
  const zone = e.target.closest(`[data-drop="${d.type}"]`);
  if (zone) return { zone, parent: +zone.dataset.parent };
  // Collapsed capability card accepts deliverables; deliverable note accepts tasks (appends).
  const n = noteOf(e.target);
  if (n && n.dataset.type === PARENT[d.type] && +n.dataset.id)
    return { into: n, parent: +n.dataset.id };
  return null;
}

// While dragging, scroll the board (left/right) or the list under the pointer (up/down)
// when the pointer is near its edge; faster the closer to the edge.
const EDGE = 50, // px from the edge where scrolling starts
  SPEED = 20; // px per frame at the very edge
const edgeStep = (p, lo, hi) =>
  p >= lo && p < lo + EDGE
    ? -SPEED * (1 - (p - lo) / EDGE)
    : p <= hi && p > hi - EDGE
      ? SPEED * (1 - (hi - p) / EDGE)
      : 0;
let pointer = null; // last dragover position, set below
function autoScroll() {
  if (!ui.drag) return (pointer = null);
  if (pointer) {
    const board = $("#board"),
      list = pointer.el.closest(".lane-body, .tasks");
    if (pointer.el.closest("#board")) {
      const r = board.getBoundingClientRect();
      board.scrollLeft += edgeStep(pointer.x, r.left, r.right);
    }
    if (list) {
      const r = list.getBoundingClientRect();
      list.scrollTop += edgeStep(pointer.y, r.top, r.bottom);
    }
  }
  requestAnimationFrame(autoScroll);
}

document.addEventListener("dragstart", (e) => {
  const n = noteOf(e.target);
  if (!n || !n.draggable) return;
  if (document.activeElement?.matches(".draft")) return e.preventDefault(); // selecting text in a draft
  ui.drag = selOf(n);
  requestAnimationFrame(autoScroll);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", n.dataset.id);
  requestAnimationFrame(() => n.classList.add("dragging"));
});

// Outcome lists reorder left/right; order is saved in the Outcomes table's row order (manualSort).
function laneSlot(e) {
  const lanes = [...document.querySelectorAll("#board .lane")].filter(
    (l) => +$(".lane-head", l).dataset.id,
  );
  const others = lanes.filter(
    (l) => +$(".lane-head", l).dataset.id !== ui.drag.id,
  );
  const before = others.find((l) => {
    const r = l.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2;
  });
  return { before, order: others.map((l) => +$(".lane-head", l).dataset.id) };
}

document.addEventListener("dragover", (e) => {
  pointer = { x: e.clientX, y: e.clientY, el: e.target };
  if (ui.drag?.type === "O") {
    if (!e.target.closest("#board")) return;
    e.preventDefault();
    clearDrop();
    const { before } = laneSlot(e);
    marker = document.createElement("div");
    marker.className = "lane-marker";
    $("#board").insertBefore(marker, before || $("#board .add-lane"));
    return;
  }
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  if (t.into) {
    t.into.classList.add("drop-into");
    t.index = Infinity;
    return;
  }
  const items = [...t.zone.children].filter(
    (x) => x.dataset.type === ui.drag.type && !x.classList.contains("dragging"),
  );
  const before = items.find((x) => {
    const r = x.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  });
  marker = document.createElement("div");
  marker.className = "drop-marker";
  t.zone.insertBefore(
    marker,
    before || t.zone.querySelector(":scope > .add") || null,
  );
});

document.addEventListener("drop", (e) => {
  if (ui.drag?.type === "O") {
    e.preventDefault();
    const { before, order } = laneSlot(e),
      id = ui.drag.id;
    const at = before
      ? order.indexOf(+$(".lane-head", before).dataset.id)
      : order.length;
    order.splice(at, 0, id);
    clearDrop();
    ui.drag = null;
    act([
      [
        "BulkUpdateRecord",
        CFG.O.table,
        order,
        { manualSort: order.map((_, i) => i + 1) },
      ],
    ]);
    return;
  }
  const t = dropTarget(e),
    d = ui.drag;
  if (!t || !d) return;
  e.preventDefault();
  let index = Infinity,
    beforeId = null;
  if (t.zone && marker) {
    // index among the parent's full child list, not just the visible ones
    const next = marker.nextElementSibling;
    const full = kidsOf(d.type, t.parent);
    beforeId =
      next?.dataset?.type === d.type && +next.dataset.id
        ? +next.dataset.id
        : null;
    index = beforeId ? full.indexOf(beforeId) : full.length;
    if (index < 0) index = full.length;
  }
  clearDrop();
  ui.drag = null;
  move(d.type, d.id, d.parent, t.parent, index, beforeId);
});

document.addEventListener("dragend", () => {
  clearDrop();
  ui.drag = null;
  document
    .querySelectorAll(".dragging")
    .forEach((x) => x.classList.remove("dragging"));
});

// ---- Toolbar & startup -----------------------------------------------------------------------------
$("#search").addEventListener("input", render);
$("#hideDone").addEventListener("change", render);
$("#expandAll").addEventListener("click", () => {
  document
    .querySelectorAll("#board .cap")
    .forEach((c) => ui.expanded.add(ekey(+c.dataset.parent, +c.dataset.id)));
  render();
});
$("#collapseAll").addEventListener("click", () => {
  ui.expanded.clear();
  render();
});

api.ready({ requiredAccess: "full" });
api.enableKeyboardShortcuts?.(); // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z run Grist's undo/redo (not inside text boxes)
api.onRecords?.(() => refresh()); // fires when the table this widget is bound to changes
setInterval(() => {
  if (!document.hidden) refresh();
}, 5000); // catch edits to the other three tables
refresh();
