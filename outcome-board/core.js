/* Link board: Outcomes (lists) -> Capabilities (sticky notes) -> Deliverables (small notes) -> Tasks (checklist).
 * All four are rows of one Items table (Type says which). Links are many-to-many: each item lists its
 * children (Items.Children, whose order is the display order); Grist's two-way reference keeps
 * Items.Parents in sync. A child can skip levels (a task directly under a capability), but is always
 * at a lower level than its parent.
 *
 * core.js: shared data and actions -- column config, loading the tables, and the user actions that
 * change them. The current page draws itself through page.render(). */

// ---- Column names: adjust here if you rename things in Grist -------------------------------------
export const CFG = {
  I: {
    table: "Items",
    name: "Item",
    type: "Type",
    children: "Children",
    parents: "Parents", // two-way with Children
    status: "Status",
    urgency: "Urgency",
    impact: "Impact",
    effort: "Effort", // shown: rolled up from the children, else the estimate
    effortEstimate: "Effort_Estimate", // entered (a task's effort)
    note: "Review_Note",
    proposed: "Proposed_By",
  },
  // Sprints.Items lists the sprint's items (two-way with Items.Sprints); membership is written here.
  SP: {
    table: "Sprints",
    name: "Sprint",
    start: "Start",
    end: "End",
    status: "Status",
    items: "Items",
  },
  // a row (Parent, Child) makes that link optional
  LW: {
    table: "Link_weights",
    parent: "Parent",
    child: "Child",
  },
};
// Items.Type for each level
export const TYPES = {
  O: "Outcome",
  C: "Capability",
  D: "Deliverable",
  T: "Task",
};
export const tableOf = (type) => (type === "SP" ? CFG.SP : CFG.I).table;
// Items have Impact/Effort (shown), *_Rollup (formula) and *_Estimate (entered).
// Editable fields in the side pane, per level: [column, label, kind]
const STATUSES = ["Not Started", "In Progress", "Review", "Done"]; // a done capability shows as "Available"
const SPRINT_STATUSES = ["Planned", "Active", "Completed"];
// kind: "number", "urgency", "date", "text", or a list of choices
export const FIELDS = {
  O: [
    ["Status", "Status", STATUSES],
    ["Target_Date", "Target date", "date"],
    ["Impact_Estimate", "Impact", "number"],
  ],
  C: [
    ["Status", "Status", STATUSES],
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
// can an item of level p have a child of level c?
export const canParent = (p, c) =>
  LEVELS.includes(p) && LEVELS.indexOf(p) < LEVELS.indexOf(c);
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
  NOT_STARTED = "Not Started";

const api = window.GRIST_MOCK || grist;
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const refs = (v) => (Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : []);

export let S = {
  all: new Map(), // every item by id
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
  hidePlanned: false, // pool leaves out items already in a planned or active sprint (sprints page)
};

// ---- Data ------------------------------------------------------------------------------------------
async function load() {
  const [items, sprints, weights] = await Promise.all([
    api.docApi.fetchTable(CFG.I.table),
    api.docApi.fetchTable(CFG.SP.table).catch(() => null), // no Sprints table yet: no sprints
    api.docApi.fetchTable(CFG.LW.table).catch(() => null), // no Link_weights: no optional links
  ]);
  // one map per level (items with no known Type are left out)
  const next = Object.fromEntries(LEVELS.map((k) => [k, new Map()]));
  const levelOf = Object.fromEntries(LEVELS.map((k) => [TYPES[k], k]));
  for (const row of rowsOf(items)) {
    const k = levelOf[row[CFG.I.type]];
    if (k)
      next[k].set(row.id, {
        id: row.id,
        type: k,
        row,
        name: row[CFG.I.name] || "(untitled)",
        children: refs(row[CFG.I.children]),
        kids: { C: [], D: [], T: [] }, // children by level
        parents: [],
      });
  }
  next.all = new Map(LEVELS.flatMap((k) => [...next[k]]));
  for (const p of next.all.values()) {
    // kids and parents from the parent-side lists; drop dangling refs and children that aren't at a
    // lower level
    p.children = p.children.filter((id) =>
      canParent(p.type, next.all.get(id)?.type),
    );
    for (const id of p.children) {
      const c = next.all.get(id);
      p.kids[c.type].push(id);
      c.parents.push(p.id);
    }
  }
  const pos = (x) => x.row.manualSort ?? x.id; // row order in Grist; used for outcome lists and the pool
  for (const k of LEVELS)
    next[k] = new Map(
      [...next[k].values()]
        .sort((a, b) => pos(a) - pos(b))
        .map((x) => [x.id, x]),
    );
  next.SP = loadSprints(sprints, next);
  next.hasSprints = !!sprints; // the Sprints table exists (extend_schema.py has run)
  next.hasWeights = !!weights;
  next.optional = new Map(); // "parent:child" -> Link_weights row ids
  for (const r of weights ? rowsOf(weights) : []) {
    const k = `${r[CFG.LW.parent]}:${r[CFG.LW.child]}`;
    next.optional.set(k, [...(next.optional.get(k) || []), r.id]);
  }
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
      items: refs(row[CFG.SP.items]), // all its items, in order
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
  for (const s of list) {
    // its items by level (each in its order)
    s.kids = Object.fromEntries(
      LEVELS.map((k) => [k, s.items.filter((id) => next[k].has(id))]),
    );
    for (const k in s.kids)
      s.kids[k].forEach((id) => next[k].get(id).own.add(s.id));
  }
  for (const k of ["C", "D", "T"])
    // parents are at higher levels, so their via is complete before their children's
    for (const x of next[k].values())
      for (const pid of x.parents) {
        const p = next.all.get(pid),
          add = (sid, src) =>
            x.own.has(sid) || x.via.has(sid) || x.via.set(sid, src);
        p.own.forEach((sid) => add(sid, { type: p.type, item: p }));
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
    ? [...S.all.get(parent).kids[type]]
    : [...S[type].values()]
        .filter((x) => ui.showAll || !x.parents.length)
        .filter((x) => !(ui.hidePlanned && planned(x)))
        .map((x) => x.id);
// in a sprint that isn't completed, directly or through a parent
const planned = (x) =>
  [...x.own, ...x.via.keys()].some(
    (sid) => S.SP.get(sid)?.status !== SPRINT_DONE,
  );
// Set a parent's children of one level (its other children are kept, grouped by level).
const setKids = (type, parent, list) => [
  "UpdateRecord",
  CFG.I.table,
  parent,
  {
    [CFG.I.children]: [
      "L",
      ...["C", "D", "T"].flatMap((k) =>
        k === type ? list : S.all.get(parent).kids[k],
      ),
    ],
  },
];
export const nameOf = (id) => (id ? S.all.get(id)?.name : "the pool");
// names of the pool's stand-in notes for deliverables and tasks
export const poolName = (type) =>
  `${ui.showAll ? "All" : "Unlinked"} ${PLURAL[type]}`;

// Put items of one level (or sprints) in this row order (manualSort), reusing their current positions
// so that other rows keep theirs.
export function rowOrderAction(type, ids) {
  const pos = ids
    .map((id) => S[type].get(id).row.manualSort ?? id)
    .sort((a, b) => a - b);
  return ["BulkUpdateRecord", tableOf(type), ids, { manualSort: pos }];
}

// Pool items have no parent list, so their order is the table's row order (manualSort).
function rowOrder(type, id, beforeId) {
  const all = [...S[type].keys()].filter((x) => x !== id),
    loose = kidsOf(type, 0).filter((x) => x !== id);
  let at = all.indexOf(beforeId);
  if (at < 0)
    at = loose.length ? all.indexOf(loose[loose.length - 1]) + 1 : all.length;
  all.splice(at, 0, id);
  return rowOrderAction(type, all);
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
        ...dropWeights(from, id),
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
      `${from ? "Moved" : "Linked"} “${nameOf(id)}” to “${nameOf(to)}”.`, // from the pool = a new link
    );
}

// Is the link from parent to child optional? (Its Link_weights row only counts while the link exists.)
export const isOptional = (parent, child) =>
  !!S.all.get(child)?.parents.includes(parent) &&
  S.optional.has(`${parent}:${child}`);
// Removes the link's Link_weights rows (when it's unlinked), if any.
const dropWeights = (parent, child) =>
  S.optional.has(`${parent}:${child}`)
    ? [["BulkRemoveRecord", CFG.LW.table, S.optional.get(`${parent}:${child}`)]]
    : [];

export function setOptional(parent, child, on) {
  act(
    on
      ? [
          [
            "AddRecord",
            CFG.LW.table,
            null,
            { [CFG.LW.parent]: parent, [CFG.LW.child]: child },
          ],
        ]
      : dropWeights(parent, child),
    `“${nameOf(child)}” is ${on ? "optional" : "required"} for “${nameOf(parent)}”.`,
  );
}

// Levels an item could change to: below all of its parents and above all of its children.
export const typesFor = (x) =>
  LEVELS.filter(
    (k) =>
      x.parents.every((q) => canParent(S.all.get(q).type, k)) &&
      x.children.every((c) => canParent(k, S.all.get(c).type)),
  );

export function setType(x, type) {
  act(
    [["UpdateRecord", CFG.I.table, x.id, { [CFG.I.type]: TYPES[type] }]],
    `“${x.name}” is now a ${LABEL[type]}.`,
  );
}

export function link(type, id, to) {
  const list = kidsOf(type, to);
  if (list.includes(id))
    return toast(`“${nameOf(id)}” is already on “${nameOf(to)}”.`);
  act(
    [setKids(type, to, [...list, id])],
    `Linked “${nameOf(id)}” to “${nameOf(to)}”.`,
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
      ...dropWeights(from, id),
    ],
    `Removed “${nameOf(id)}” from “${nameOf(from)}”.`,
  );
}

// The action that adds an item of a level (or a sprint) named name, under parent if given (0: none).
export function addAction(type, name, parent, fields = {}) {
  if (type === "SP")
    return [
      "AddRecord",
      CFG.SP.table,
      null,
      { [CFG.SP.name]: name, ...fields },
    ];
  return [
    "AddRecord",
    CFG.I.table,
    null,
    {
      [CFG.I.name]: name,
      [CFG.I.type]: TYPES[type],
      ...(parent ? { [CFG.I.parents]: ["L", parent] } : {}),
      ...fields,
    },
  ];
}

// Save the in-place draft: add the new record, or rename the task. A blank or unchanged name just closes it.
export function saveDraft() {
  const d = ui.draft,
    name = d.text.trim();
  ui.draft = null;
  if (!name || (d.id && name === S.T.get(d.id)?.name)) return render();
  if (d.id)
    return act([["UpdateRecord", CFG.I.table, d.id, { [CFG.I.name]: name }]]);
  act([addAction(d.type, name, d.parent, d.fields)], `Added “${name}”.`);
}

// Items that would be left with no parent if (type, id) were deleted, per level: {C: [ids], D: [...], ...}.
// Something also linked to a parent that stays is kept.
export function below(type, id) {
  const gone = { [type]: [id] },
    all = new Set([id]);
  for (const k of LEVELS.slice(LEVELS.indexOf(type) + 1)) {
    gone[k] = [...S[k].values()]
      .filter((x) => x.parents.length && x.parents.every((q) => all.has(q)))
      .map((x) => x.id);
    gone[k].forEach((i) => all.add(i));
  }
  return gone;
}

// Add an item to a sprint, or take it out (explicit membership only).
// Options: from (a sprint id): also take the item out of that sprint (a move); before (an item id):
// place it before that item in its group instead of at the end (adding an item that's already in the
// sprint just moves it there).
export function sprintLink(sid, type, id, add, { from, before } = {}) {
  const update = (sid, add) => {
    const list = S.SP.get(sid).items.filter((x) => x !== id),
      at = list.indexOf(before);
    if (add) at < 0 ? list.push(id) : list.splice(at, 0, id);
    return [
      "UpdateRecord",
      CFG.SP.table,
      sid,
      { [CFG.SP.items]: ["L", ...list] },
    ];
  };
  const name = nameOf(id),
    to = S.SP.get(sid).name,
    within = add && S.SP.get(sid).kids[type].includes(id);
  act(
    from ? [update(from, false), update(sid, true)] : [update(sid, add)],
    from
      ? `Moved “${name}” to “${to}”.`
      : within
        ? `Moved “${name}” within “${to}”.`
        : `${add ? "Added" : "Removed"} “${name}” ${add ? "to" : "from"} “${to}”.`,
  );
}

export function remove({ type, id }, withBelow) {
  const gone = withBelow ? below(type, id) : { [type]: [id] },
    n = Object.values(gone).flat().length - 1;
  ui.confirm = null;
  act(
    [["BulkRemoveRecord", CFG.I.table, Object.values(gone).flat()]],
    `Deleted “${nameOf(id)}”${n ? ` and ${n} item${n === 1 ? "" : "s"} below it` : ""}.`,
  );
}

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 3200);
}

// Each page sets page.render to draw itself; shared code calls render(). A page can also take over
// drops, unlinking (x / Delete), and pasting: see the sprints page.
export const page = {
  render() {},
  dropTarget: null, // (event) -> where a drag would land, or null
  drop: null, // (drag, target)
  unlink: null, // (sel, note element)
  paste: null, // (clip, selected element) -> true if handled
};
export const render = () => page.render();

// Connect to Grist (or the mock) and keep the data fresh.
export function start() {
  api.ready({ requiredAccess: "full" });
  api.enableKeyboardShortcuts?.(); // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z run Grist's undo/redo (not inside text boxes)
  api.onRecords?.(() => refresh()); // fires when the table this widget is bound to changes
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 5000); // catch edits to the other table (Items or Sprints)
  refresh();
}
