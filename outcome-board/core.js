/* Link board: Outcomes (lists) -> Capabilities (sticky notes) -> Deliverables (small notes) -> Tasks (checklist).
 * Links are many-to-many. Each link is written on the PARENT side (parent's RefList order = display order);
 * Grist's two-way references keep the child side in sync.
 *
 * core.js: shared data and actions -- column config, loading the four tables, and the user actions that
 * change them. The current page draws itself through page.render(). */

// ---- Column names: adjust here if you rename things in Grist -------------------------------------
export const CFG = {
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
  // Sprints has one link column per item table, named after it (Sprints.Outcomes, ...); each item
  // table has a Sprints column (two-way). Membership is written on the Sprints side.
  SP: {
    table: "Sprints",
    name: "Sprint",
    start: "Start",
    end: "End",
    status: "Status",
  },
};
// Capabilities and Deliverables have Impact/Effort (shown), *_Rollup (formula) and *_Estimate (entered).
// Editable fields in the side pane, per level: [column, label, kind]
const STATUSES = ["Not Started", "In Progress", "Review", "Done"];
const CAP_STATUSES = ["Not Started", "In Progress", "Available"]; // "Available" counts as done
const SPRINT_STATUSES = ["Planned", "Active", "Completed"];
// kind: "number", "urgency", "date", "text", or a list of choices
export const FIELDS = {
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
  SP: [
    ["Status", "Status", SPRINT_STATUSES],
    ["Start", "Start", "date"],
    ["End", "End", "date"],
    ["Notes", "Notes", "text"],
  ],
};
export const URGENCY = ["", "Elevated", "High"]; // blank = normal
export const SPRINT_DONE = "Completed"; // other sprint statuses: Planned (or blank), Active
const SPRINT_COLORS = [
  "#a5c8f0",
  "#b9e3b0",
  "#d7b8f0",
  "#f6c2a0",
  "#9fe0dc",
  "#f0b8d8",
  "#d9e8a0",
  "#c9ccd1",
];
const LEVELS = ["O", "C", "D", "T"];
const CHILD = { O: "C", C: "D", D: "T" };
export const PARENT = { C: "O", D: "C", T: "D" };
export const LABEL = {
  O: "outcome",
  C: "capability",
  D: "deliverable",
  T: "task",
  SP: "sprint",
};
const PLURAL = {
  O: "outcomes",
  C: "capabilities",
  D: "deliverables",
  T: "tasks",
};
export const plural = (n, type) =>
  `${n} ${n === 1 ? LABEL[type] : PLURAL[type]}`;
export const DONE = "Done",
  NOT_STARTED = "Not Started",
  AVAILABLE = "Available";

const api = window.GRIST_MOCK || grist;
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const refs = (v) => (Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : []);

export let S = {
  O: new Map(),
  C: new Map(),
  D: new Map(),
  T: new Map(),
  SP: new Map(),
};
// Grist's column-wise table -> list of row objects
const rowsOf = (t) =>
  t.id.map((id, r) => {
    const row = { id };
    for (const col in t) if (col !== "id") row[col] = t[col][r];
    return row;
  });
export const ekey = (out, cap) => `${out}:${cap}`; // expanded state is per copy (outcome:capability)
export const ui = {
  expanded: new Set(),
  sel: null,
  clip: null,
  pane: null,
  drag: null,
  busy: false,
  draft: null, // name being typed in place: {type, parent, text} for a new record (plus fields: extra
  // columns to set; a new sprint also has forType/forId, the item whose menu it replaced), or with id
  // to rename a task
  confirm: null, // {type, id} of the item whose delete is waiting for confirmation
  showAll: false, // pool shows every item, not just unlinked ones ("Hide linked" unticked)
};

// ---- Data ------------------------------------------------------------------------------------------
async function load() {
  const [tabs, sprints] = await Promise.all([
    Promise.all(LEVELS.map((k) => api.docApi.fetchTable(CFG[k].table))),
    api.docApi.fetchTable(CFG.SP.table).catch(() => null), // no Sprints table yet: no sprints
  ]);
  const next = {};
  LEVELS.forEach((k, i) => {
    const m = new Map();
    rowsOf(tabs[i]).forEach((row) => {
      const id = row.id;
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
  next.SP = loadSprints(sprints, next);
  next.hasSprints = !!sprints; // the Sprints table exists (extend_schema.py has run)
  S = next;
}

// Sprints in start-date order. Each item gets own (ids of sprints listing it) and via (sprint id ->
// {type, item}: the ancestor that is in that sprint, for sprints it only inherits).
function loadSprints(table, next) {
  const list = (table ? rowsOf(table) : [])
    .map((row) => ({
      id: row.id,
      row,
      name: row[CFG.SP.name] || "(untitled)",
      status: row[CFG.SP.status] || "Planned",
      parents: [], // sprints sit at the top, like outcomes
      color: SPRINT_COLORS[(row.id - 1) % SPRINT_COLORS.length],
      kids: Object.fromEntries(
        LEVELS.map((k) => [
          k,
          refs(row[CFG[k].table]).filter((id) => next[k].has(id)),
        ]),
      ),
    }))
    .sort((a, b) => a.id - b.id);
  // Start-date order until the sprints have been put in some other order by hand (dragging their
  // headers, or reordering rows in Grist): then row order (manualSort) wins.
  const pos = (s) => s.row.manualSort ?? s.id,
    byHand = list.some((s, i) => i && pos(s) < pos(list[i - 1])),
    start = (s) => s.row[CFG.SP.start] ?? Infinity;
  list.sort((a, b) =>
    byHand ? pos(a) - pos(b) : start(a) - start(b) || a.id - b.id,
  );
  for (const k of LEVELS)
    for (const x of next[k].values()) {
      x.own = new Set();
      x.via = new Map();
    }
  for (const s of list)
    for (const k in s.kids)
      s.kids[k].forEach((id) => next[k].get(id).own.add(s.id));
  for (const k of ["C", "D", "T"])
    // parents' via is complete before their children's
    for (const x of next[k].values())
      for (const pid of x.parents) {
        const p = next[PARENT[k]].get(pid),
          add = (sid, src) =>
            x.own.has(sid) || x.via.has(sid) || x.via.set(sid, src);
        p.own.forEach((sid) => add(sid, { type: PARENT[k], item: p }));
        p.via.forEach((src, sid) => add(sid, src));
      }
  return new Map(list.map((s) => [s.id, s]));
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

export async function act(actions, msg) {
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

export const kidsOf = (type, parent) =>
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
export const nameOf = (type, id) => (id ? S[type].get(id)?.name : "the pool");
// names of the pool's stand-in notes for deliverables and tasks
export const poolName = (type) =>
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

export function move(type, id, from, to, index, beforeId) {
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

export function link(type, id, to) {
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

export function unlink(type, id, from) {
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
export function saveDraft() {
  const d = ui.draft,
    name = d.text.trim();
  ui.draft = null;
  if (!name || (d.id && name === S.T.get(d.id)?.name)) return render();
  if (d.id)
    return act([["UpdateRecord", CFG.T.table, d.id, { [CFG.T.name]: name }]]);
  const fields = { [CFG[d.type].name]: name, ...d.fields };
  if (d.parent) fields[CFG[d.type].parents] = ["L", d.parent];
  act([["AddRecord", CFG[d.type].table, null, fields]], `Added “${name}”.`);
}

// Items that would be left with no parent if (type, id) were deleted, per level: {C: [ids], D: [...], ...}.
// Something also linked to a parent that stays is kept.
export function below(type, id) {
  const gone = { [type]: [id] };
  for (let p = type, k = CHILD[type]; k; p = k, k = CHILD[k])
    gone[k] = [...S[k].values()]
      .filter(
        (x) => x.parents.length && x.parents.every((q) => gone[p].includes(q)),
      )
      .map((x) => x.id);
  return gone;
}

// Add an item to a sprint, or take it out (explicit membership only).
export function sprintLink(sid, type, id, add) {
  const sp = S.SP.get(sid),
    list = sp.kids[type].filter((x) => x !== id);
  if (add) list.push(id);
  act(
    [
      [
        "UpdateRecord",
        CFG.SP.table,
        sid,
        { [CFG[type].table]: ["L", ...list] },
      ],
    ],
    `${add ? "Added" : "Removed"} “${nameOf(type, id)}” ${add ? "to" : "from"} “${sp.name}”.`,
  );
}

export function remove({ type, id }, withBelow) {
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

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 3200);
}

// Each page sets page.render to draw itself; shared code calls render().
export const page = { render() {}, itemDrag: true }; // itemDrag false: only lists can be dragged
export const render = () => page.render();

// Connect to Grist (or the mock) and keep the data fresh.
export function start() {
  api.ready({ requiredAccess: "full" });
  api.enableKeyboardShortcuts?.(); // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z run Grist's undo/redo (not inside text boxes)
  api.onRecords?.(() => refresh()); // fires when the table this widget is bound to changes
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 5000); // catch edits to the other three tables
  refresh();
}
