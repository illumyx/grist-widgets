/* Shared rendering and interaction: capability cards, deliverable notes, the side pane, editing,
 * keyboard, and drag and drop. Used by every page. */

import {
  SPRINT_DONE,
  sprintLink,
  act,
  move,
  link,
  unlink,
  saveDraft,
  below,
  remove,
  toast,
  CFG,
  FIELDS,
  DUE_FIELDS,
  URGENCY,
  SHELVED,
  shelvedOf,
  canParent,
  LABEL,
  plural,
  DONE,
  esc,
  S,
  ekey,
  ui,
  kidsOf,
  nameOf,
  render,
  NOT_STARTED,
  statusOf,
  TYPES,
  isOptional,
  setOptional,
  typesFor,
  parentsFor,
  setType,
  assigneesOf,
  toggleAssignee,
  tableOf,
  addAction,
  rowOrderAction,
  doneOf,
  doneIn,
  archive,
  $,
  page,
} from "./core.js";
import {
  filters,
  matches,
  unhidden,
  visible,
  hit,
  peopleOn,
  matchesAll,
  whoMenu,
  drawWith,
  flat,
  asQuery,
} from "./filters.js";

// ---- Rendering -------------------------------------------------------------------------------------
// a shelved item (when shown) is drawn faded, with a Tabled or Archived tag
export const shelfClass = (x) => (shelvedOf(x) ? " shelved" : "");
export const shelfHTML = (x) =>
  shelvedOf(x)
    ? `<span class="pill shelf">${esc(x.row[CFG.I.shelved])}</span>`
    : "";
// where an item is linked: "3 capabilities", or "3 places" when its parents are at different levels
const onWhat = (x) => {
  const levels = new Set(x.parents.map((q) => S.all.get(q).type));
  return levels.size === 1
    ? plural(x.parents.length, [...levels][0])
    : `${x.parents.length} places`;
};
const copies = (x) =>
  x.parents.length > 1
    ? `<span class="copies" title="On ${onWhat(x)}">×${x.parents.length}</span>`
    : "";
export const num = (v) =>
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
// Dates (Grist stores seconds since 1970, UTC midnight): "Nov 10" (with the year if it isn't this
// year's), or a whole month, "Oct 2026"
const DAY = 86400;
const utc = (sec) => new Date(sec * 1000);
const dateText = (sec, opts) =>
  utc(sec).toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
export const day = (sec) =>
  dateText(sec, {
    month: "short",
    day: "numeric",
    ...(utc(sec).getUTCFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  });
const month = (sec) => dateText(sec, { month: "short", year: "numeric" });
const firstOfMonth = (sec) => utc(sec).getUTCDate() === 1;
const lastOfMonth = (sec) => utc(sec + DAY).getUTCDate() === 1;
// When an item is due: "Due Nov 10", "Due Oct 2026", "Due Dec 2026 - Jan 2027", "Due Mar 2027 or
// later", and/or its timing note. Red once the due-by day has passed, unless it's done or shelved.
export function dueHTML(x) {
  const from = num(x.row[CFG.I.targetFrom]),
    by = num(x.row[CFG.I.targetDate]),
    note = x.row[CFG.I.targetNote];
  let when = "";
  if (from && by)
    when =
      firstOfMonth(from) && lastOfMonth(by)
        ? [...new Set([month(from), month(by)])].join(" - ")
        : `${day(from)} - ${day(by)}`;
  else if (by) when = day(by);
  else if (from)
    when = `${firstOfMonth(from) ? month(from) : day(from)} or later`;
  const text = [when && `Due ${when}`, note && (when ? `(${note})` : note)]
    .filter(Boolean)
    .join(" ");
  const late =
    by && !doneOf(x) && !shelvedOf(x) && by + DAY <= Date.now() / 1000;
  return text
    ? `<span class="due${late ? " late" : ""}"${late ? ' title="Overdue"' : ""}>${esc(text)}</span>`
    : "";
}
// the initials of the people an item is assigned to, then (faded) of the others on what's under it
export const whoHTML = (x) => {
  const own = assigneesOf(x),
    via = [...peopleOn(x)].filter((p) => !own.includes(p));
  return [
    ...own.map(
      (p) => `<span class="who" title="Assigned to ${esc(p)}">${esc(p)}</span>`,
    ),
    ...via.map(
      (p) =>
        `<span class="who via" title="${esc(p)} is on something under it">${esc(p)}</span>`,
    ),
  ].join("");
};
// "Assign..." menu for a task in the checklist; picking a person assigns or unassigns them
const assignMenu = (t) =>
  `<select data-assign aria-label="Assign"><option value="">Assign...</option>${S.people.map((p) => `<option value="${esc(p)}">${assigneesOf(t).includes(p) ? "✓ " : ""}${esc(p)}</option>`).join("")}</select>`;
// marks a note whose link to the parent it's drawn under is optional
const optHTML = (parent, id) =>
  isOptional(parent, id) ? `<span class="pill">optional</span>` : "";
const urgRank = (u) => URGENCY.indexOf(u || "");
// urgency shows as ! (Elevated) or !! (High) in a red chip before the name
const URG_MARK = { Elevated: "!", High: "!!" };
const urgHTML = (u, title = `Urgency: ${u}`) =>
  URG_MARK[u]
    ? `<span class="urgmark" data-u="${esc(u)}" title="${esc(title)}" aria-label="${esc(title)}">${URG_MARK[u]}</span>`
    : "";
// colors the bar at the left of an item's card, note, row, or outcome header by its status
export const statusAttr = (x) => ` data-status="${esc(statusOf(x))}"`;
export const paneIs = (type, id) => ui.pane?.type === type && ui.pane.id === id;

const TRASH = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/></svg>`;
function confirmHTML({ type, id }) {
  // "Delete X?" with the choice to also delete what's only linked under it
  const x = S[type].get(id),
    gone = below(type, id);
  const more = Object.entries(gone)
    .filter(([k, ids]) => k !== type && ids.length)
    .map(([k, ids]) => plural(ids.length, k))
    .join(", ");
  const where = x.parents.length > 1 ? ` It's on ${onWhat(x)}.` : "";
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
export function addHTML(type, parent) {
  // "+ Add ..." button for a list (an outcome or sprint), or the new list being named in its place
  const d = ui.draft;
  if (d && d.type === type && d.parent === parent)
    return `<section class="lane"><div class="lane-head">${draftHTML(LABEL[type], d.text)}</div></section>`;
  return `<button class="add-lane" data-add="${type}" data-parent="${parent}">+ Add ${LABEL[type]}</button>`;
}

// "+ Add item": a name box with a chip for each level the new item can be (types). Enter adds it under
// parent (0: none), and to sprint if given, and leaves the box open for the next one; Esc closes it,
// and so does clicking away (adding what was typed). key tells boxes apart (a capability's copies
// share its id). The chip picked is the last one picked, if types has it, else first (or types[0]).
let lastType = null;
export function addItemHTML(key, types, parent, sprint = 0, first = types[0]) {
  const a = ui.adding;
  if (a?.key !== key)
    return `<button class="add" data-additem="${key}" data-types="${types.join("")}" data-first="${first}" data-parent="${parent}" data-sprint="${sprint}">+ Add item</button>`;
  const chips = types
    .map(
      (k) =>
        `<button type="button" class="type-chip" tabindex="-1" data-addtype="${k}" aria-pressed="${k === a.type}">${TYPES[k]}</button>`,
    )
    .join("");
  return `<form class="additem"><div class="type-chips">${chips}</div>
    <input type="text" value="${esc(a.text)}" placeholder="Name, then Enter" title="Alt+O/C/D/T picks the type" aria-label="New item"></form>`;
}
function addItem({ type, text, parent, sprint }) {
  const name = text.trim();
  if (!name) return;
  act(
    [
      addAction(
        type,
        name,
        parent,
        sprint ? { [CFG.I.sprints]: ["L", sprint] } : {},
      ),
    ],
    `Added “${name}”.`,
  );
}
function pickType(k) {
  if (!$(`.additem [data-addtype="${k}"]`)) return; // not a level this box can add
  ui.adding.type = lastType = k;
  document
    .querySelectorAll("[data-addtype]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.addtype === k));
}
const TYPE_KEYS = { KeyO: "O", KeyC: "C", KeyD: "D", KeyT: "T" }; // Alt+O/C/D/T picks the level

// Sprint pills: an item's own sprints, then faded ones it inherits from a parent. Completed
// sprints aren't shown. With removable, own pills get an x (the side pane).
export function pills(x, removable) {
  if (!x.own) return ""; // the pool's stand-in cards
  const pill = (sid, src) => {
    const sp = S.SP.get(sid);
    if (!sp || sp.status === SPRINT_DONE) return "";
    const why = src ? ` (via ${LABEL[src.type]} “${esc(src.item.name)}”)` : "";
    return `<span class="sp${src ? " via" : ""}" style="--sp:${sp.color}" title="${esc(sp.name)}${why}">${esc(sp.name)}${removable && !src ? `<button class="sp-x" data-unsprint="${sid}" aria-label="Remove from ${esc(sp.name)}">×</button>` : ""}</span>`;
  };
  return (
    [...x.own].map((sid) => pill(sid)).join("") +
    [...x.via].map(([sid, src]) => pill(sid, src)).join("")
  );
}

// Side pane row: the item's sprint pills (own ones removable) and a menu to add it to an open sprint.
// "Add to sprint..." menu for an item (type, x). "New sprint..." swaps it for a name box (a draft);
// saving creates the sprint with the item in it.
function sprintMenu(type, x) {
  const d = ui.draft;
  if (d?.type === "SP" && d.forType === type && d.forId === x.id)
    return draftHTML(LABEL.SP, d.text);
  const open = [...S.SP.values()].filter(
    (sp) => sp.status !== SPRINT_DONE && !x.own.has(sp.id),
  );
  return `<select data-addsprint aria-label="Add to sprint"><option value="">Add to sprint...</option>${open.map((sp) => `<option value="${sp.id}">${esc(sp.name)}</option>`).join("")}<option value="new">New sprint...</option></select>`;
}
// The item a sprint control belongs to: its task row, else the side pane's item.
const sprintTarget = (el) => {
  const task = el.closest(".task");
  return task ? ["T", +task.dataset.id] : [ui.pane.type, ui.pane.id];
};

// Side pane row: the item's sprint pills (own ones removable) and the menu.
const sprintsHTML = (type, x) =>
  `<div class="sprints"><span class="label">Sprints</span>${pills(x, true)}${sprintMenu(type, x)}</div>`;

// Is a note open (key: its copy, see ekey)? Opened with its arrow, or by itself when it's only there
// for what's under it (filtering); never when drawing flat.
const opens = (key, filtering) =>
  !flat() && (ui.expanded.has(key) || !!filtering);
// a note's arrow, which opens and closes it (none when drawing flat)
const chevHTML = (open) =>
  flat()
    ? ""
    : `<button class="chev" data-toggle aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"}">${open ? "▾" : "▸"}</button>`;

// A deliverable note. Its arrow opens it to show its tasks as rows; it opens by itself when it's only
// there for its tasks (they match a filter and it doesn't), showing just those.
export function delHTML(d, cap, xTitle = "Remove from this capability") {
  const tasks = d.kids.T.map((t) => S.T.get(t)).filter((t) => !shelvedOf(t)),
    done = tasks.filter(doneOf).length;
  const st = d.row[CFG.I.status] || "";
  const filtering = !matchesAll(d),
    open = opens(ekey(cap, d.id), filtering);
  return `<div class="del${shelfClass(d)}${paneIs("D", d.id) ? " open" : ""}" data-drag tabindex="0" data-type="D" data-id="${d.id}" data-parent="${cap}"${statusAttr(d)}>
    ${chevHTML(open)}${urgHTML(d.row[CFG.I.urgency])}${esc(d.name)}${copies(d)}${dueHTML(d)}
    <div class="meta">${tasks.length ? `<span>${done}/${tasks.length} tasks</span>` : ""}${st ? `<span>${esc(st)}</span>` : ""}${shelfHTML(d)}${optHTML(cap, d.id)}${whoHTML(d)}${pills(d)}</div>${metrics(d)}
    ${
      open
        ? directTasksHTML(d, "Remove from this deliverable", !!filtering) +
          addItemHTML(`del${ekey(cap, d.id)}`, ["T"], d.id)
        : ""
    }
    ${cap ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;
}

// A task shown on its own (directly under a card or list, or in a sprint): a small row. Clicking it
// opens its side pane.
export const trowHTML = (t, parent, xTitle) =>
  `<div class="trow${doneOf(t) ? " done" : ""}${shelfClass(t)}${paneIs("T", t.id) ? " open" : ""}" data-drag tabindex="0" data-type="T" data-id="${t.id}" data-parent="${parent}"${statusAttr(t)}>
    <input type="checkbox" data-check${doneOf(t) ? " checked" : ""} aria-label="Done"><span class="name">${urgHTML(t.row[CFG.I.urgency])}${esc(t.name)}</span>${dueHTML(t)}${shelfHTML(t)}${optHTML(parent, t.id)}${whoHTML(t)}${xTitle ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;

// A card's or outcome list's own deliverables and tasks (linked directly, skipping a level)
export function directDelsHTML(p, xTitle) {
  const dels = p.kids.D.map((d) => S.D.get(d))
    .filter(visible)
    .filter(hit);
  return dels.length
    ? `<div class="dels" data-drop="D" data-parent="${p.id}">${dels.map((d) => delHTML(d, p.id, xTitle)).join("")}</div>`
    : "";
}
export function directTasksHTML(p, xTitle, onlyMatches = false) {
  const tasks = p.kids.T.map((t) => S.T.get(t))
    .filter(visible)
    .filter((t) => !onlyMatches || matches(t));
  return tasks.length
    ? `<div class="trows" data-drop="T" data-parent="${p.id}">${tasks.map((t) => trowHTML(t, p.id, xTitle)).join("")}</div>`
    : "";
}

export function capHTML(c, out, xTitle = "Remove from this outcome") {
  const dels = c.kids.D.map((d) => S.D.get(d)).filter(visible);
  const shown = dels.filter(hit);
  const ownT = c.kids.T.map((t) => S.T.get(t)).filter(visible);
  // the card is only here for its matching deliverables/tasks (by name, or by person)
  const filtering = !matchesAll(c);
  if (filtering && !shown.length && !ownT.some(matches)) return "";
  const cst = c.row[CFG.I.status] || "";
  if (!visible(c)) return "";
  const open = opens(ekey(out, c.id), filtering);
  const list = filtering ? shown : dels;
  const urg = [...dels, ...ownT]
    .filter((d) => !doneOf(d) && !shelvedOf(d))
    .map((d) => d.row[CFG.I.urgency])
    .sort((x, y) => urgRank(y) - urgRank(x))[0];
  return `<div class="cap${shelfClass(c)}${paneIs("C", c.id) ? " open" : ""}" data-drag tabindex="0" data-type="C" data-id="${c.id}" data-parent="${out}"${statusAttr(c)}>
    <div class="cap-title">${chevHTML(open)}${urgHTML(urg, `Most urgent under it: ${urg}`)}${esc(c.name)}</div>${dueHTML(c)}
    ${copies(c)}
    <div class="meta"><span>${plural(dels.length, "D")}</span>${ownT.length ? `<span>${plural(ownT.length, "T")}</span>` : ""}${shelfHTML(c)}${optHTML(out, c.id)}

      ${cst ? `<span class="pill${cst === DONE ? " ok" : ""}">${cst === DONE ? "✓ Available" : esc(cst)}</span>` : ""}
      ${c.row[CFG.I.proposed] ? `<span class="pill">${esc(c.row[CFG.I.proposed])}</span>` : ""}${whoHTML(c)}${pills(c)}</div>
    ${metrics(c)}
    ${
      open
        ? `<div class="dels" data-drop="D" data-parent="${c.id}">${list.map((d) => delHTML(d, c.id)).join("")}</div>
      ${directTasksHTML(c, "Remove from this capability")}
      ${addItemHTML(`cap${ekey(out, c.id)}`, ["D", "T"], c.id)}`
        : ""
    }
    ${out ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;
}

// An outcome on the sprints page (in the pool or a sprint): a card whose arrow opens it to show what
// an outcome list on the board holds -- its capability cards, then the deliverables and tasks linked
// to it directly. It opens by itself when it's only there for what's under it (that matches a filter
// and it doesn't), showing just that.
export function ocardHTML(o, parent, xTitle) {
  const filtering = !matchesAll(o),
    open = opens(ekey(parent, o.id), filtering),
    X = "Remove from this outcome",
    body = open
      ? o.kids.C.map((c) => capHTML(S.C.get(c), o.id)).join("") +
        directDelsHTML(o, X) +
        directTasksHTML(o, X, !!filtering)
      : "";
  if (filtering && !body) return ""; // only here for what's under it, and none of that is shown
  return `<div class="ocard${shelfClass(o)}${paneIs("O", o.id) ? " open" : ""}" data-drag tabindex="0" data-type="O" data-id="${o.id}" data-parent="${parent}"${statusAttr(o)}>
    ${chevHTML(open)}${esc(o.name)}${dueHTML(o)}
    <div class="meta"><span>${plural(o.kids.C.length, "C")}</span>${shelfHTML(o)}${whoHTML(o)}</div>
    ${open ? `<div class="obody">${body}${addItemHTML(`oc${ekey(parent, o.id)}`, ["C", "D", "T"], o.id)}</div>` : ""}
    ${xTitle ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;
}

// choice fields whose blank is a choice too: [choices, what the blank is called]
const WITH_BLANK = {
  urgency: [URGENCY, "Normal"],
  shelved: [["", ...SHELVED], "No"],
};
function renderPane() {
  const pane = $("#pane"),
    p = ui.pane;
  const x = p && S[p.type].get(p.id);
  document.body.classList.toggle("pane-open", !!x);
  if (!x) {
    pane.hidden = true;
    ui.pane = null;
    return;
  }
  pane.hidden = false;
  const L = p.type,
    cfg = CFG[L] || CFG.I, // a sprint, or an item
    note = x.row[cfg.note];
  const field = ([col, label, kind]) => {
    const v = x.row[col] ?? "";
    let input;
    if (kind === "number")
      input = `<input type="number" step="any" data-field="${col}" value="${esc(v)}">`;
    else if (kind === "date")
      // Grist dates are seconds since 1970 (UTC midnight)
      input = `<input type="date" data-field="${col}" value="${v === "" ? "" : new Date(v * 1000).toISOString().slice(0, 10)}">`;
    else if (kind === "text")
      input = `<input type="text" data-field="${col}" value="${esc(v)}">`;
    else {
      const list = Array.isArray(kind),
        [choices, blank] = WITH_BLANK[kind] || [kind],
        opts = list
          ? [...kind, ...(v && !kind.includes(v) ? [v] : [])]
          : choices;
      input = `<select data-field="${col}">${list && !v ? `<option value="" selected></option>` : ""}${opts
        .map(
          (o) =>
            `<option value="${esc(o)}"${o === v ? " selected" : ""}>${esc(o || blank)}</option>`,
        )
        .join("")}</select>`;
    }
    return `<label class="field"><span>${label}</span>${input}</label>`;
  };
  // a parent's name, with a box to make the link to it optional
  // a parent's name (click it to open its side pane), with a box to make the link to it optional
  const chip = (q) =>
    `<span class="chip"><button type="button" data-open="${q}" title="Open “${esc(nameOf(q))}”">${esc(nameOf(q))}</button>${S.hasWeights ? ` <label title="Optional for “${esc(nameOf(q))}”"><input type="checkbox" data-optional="${q}"${isOptional(q, x.id) ? " checked" : ""}> optional</label>` : ""}</span>`;
  // Type: levels its children don't allow are greyed out; a level one of its parents can't hold is
  // marked "(moves up)": choosing it moves the item up past that parent (see setType)
  const typeField = () => {
    const ok = typesFor(x),
      option = ([k, name]) => {
        if (!ok.includes(k))
          return `<option value="${k}" disabled title="It must be above its children">${name}</option>`;
        const up = parentsFor(x, k).join() !== x.parents.join();
        return `<option value="${k}"${k === L ? " selected" : ""}>${name}${up ? " (moves up)" : ""}</option>`;
      };
    return `<label class="field"><span>Type</span><select data-settype>${Object.entries(
      TYPES,
    )
      .map(option)
      .join("")}</select></label>`;
  };
  // Assigned: a box per person
  const peopleField = () =>
    `<div class="field"><span>Assigned</span><div class="people">${S.people.map((p) => `<label><input type="checkbox" data-person="${esc(p)}"${assigneesOf(x).includes(p) ? " checked" : ""}> ${esc(p)}</label>`).join("")}</div></div>`;
  const sum = [measure(x, "Impact"), measure(x, "Effort")]
    .filter(Boolean)
    .join(" · ");
  let html = `<div class="pane-head"><div class="kind">${LABEL[L]}</div><textarea class="title" data-field="${cfg.name}" rows="1" aria-label="Name">${esc(x.row[cfg.name] ?? "")}</textarea>
      <button class="x" data-close aria-label="Close">×</button>
      ${x.parents.length ? `<div class="chips">${x.parents.map(chip).join("")}</div>` : ""}
      ${L !== "O" && sum ? `<div class="summary">${sum}</div>` : ""}
      ${FIELDS[L] ? `<div class="fields">${L === "SP" ? "" : typeField()}${FIELDS[L].map(field).join("")}${L === "SP" ? "" : peopleField()}</div>` : ""}
      ${L !== "SP" ? `<div class="fields">${DUE_FIELDS.map(field).join("")}</div>` : ""}
      ${S.hasSprints && L !== "SP" ? sprintsHTML(L, x) : ""}
      ${note ? `<div class="pane-note">${esc(note)}</div>` : ""}</div>`;
  if (L !== "SP" && L !== "T") {
    // the task checklist: a deliverable's tasks, or a capability's or outcome's direct ones (if any).
    // It lists them all (unless hidden by Hide done or Hide shelved); the filters only highlight.
    const tasks = x.kids.T.map((t) => S.T.get(t)).filter(unhidden);
    if (L === "D" || tasks.length)
      html += `<div class="tasks" data-drop="T" data-parent="${x.id}">
      ${
        tasks
          .map((t) => {
            const u = t.row[CFG.I.urgency] || "";
            if (confirming("T", t.id))
              return `<div class="task" data-type="T" data-id="${t.id}" data-parent="${x.id}">${confirmHTML(ui.confirm)}</div>`;
            return `<div class="task${doneOf(t) ? " done" : ""}${shelfClass(t)}${(filters.q || filters.who) && matchesAll(t) ? " hit" : ""}" data-drag tabindex="0" data-type="T" data-id="${t.id}" data-parent="${x.id}"${statusAttr(t)}>
        <input type="checkbox" data-check${doneOf(t) ? " checked" : ""} aria-label="Done">
        <span class="name" title="Open this task">${esc(t.name)}</span>${shelfHTML(t)}${optHTML(x.id, t.id)}${whoHTML(t)}
        <button class="urg" data-urg data-u="${esc(u)}" title="Urgency: ${esc(u || "Normal")} (click to change)" aria-label="Urgency: ${esc(u || "Normal")}">${URG_MARK[u] || ""}</button>
        <input class="teff" type="number" step="any" data-teffort value="${esc(num(t.row[CFG.I.effortEstimate]) ?? "")}" placeholder="effort" aria-label="Effort">
        <span class="tsprints">${dueHTML(t)}${assignMenu(t)}${S.hasSprints ? sprintMenu("T", t) + pills(t, true) : ""}</span>
        <button class="trash" data-delete title="Delete task" aria-label="Delete task">${TRASH}</button>
        ${copies(t)}<button class="x" data-unlink title="Remove from this ${LABEL[L]}" aria-label="Remove from this ${LABEL[L]}">×</button></div>`;
          })
          .join("") || `<div class="empty">No tasks yet.</div>`
      }</div>`;
    html += `<form data-addtask><input type="text" placeholder="Add a task and press Enter" aria-label="New task"></form>`;
  }
  html += `<div class="pane-foot">${confirming(L, x.id) ? confirmHTML(ui.confirm) : `<button class="danger-link" data-delete>Delete ${LABEL[L]}</button>`}</div>`;
  // keep the task list's scroll position when redrawing the same item (refreshes, edits)
  const key = `${L}:${x.id}`,
    top = pane.dataset.key === key ? $(".tasks", pane)?.scrollTop : 0;
  pane.innerHTML = html;
  pane.dataset.key = key;
  if ($(".tasks", pane)) $(".tasks", pane).scrollTop = top || 0;
  const title = $("textarea.title", pane);
  if (title) grow(title);
}
const grow = (el) => {
  // fit a textarea's height to its text
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

function findEl(sel) {
  const css = `[data-type="${sel.type}"][data-id="${sel.id}"][data-parent="${sel.parent}"]`;
  return (
    (sel.type === "T" && $("#pane").querySelector(css)) || // tasks: the side pane's first
    $("#board").querySelector(css) ||
    (sel.type === "O" ? $(`#board .lane-head[data-id="${sel.id}"]`) : null)
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
  archiveButton();
}

document.addEventListener("click", (e) => {
  const t = e.target,
    note = noteOf(t);
  if (ui.pool.menu && !t.closest(".pool-type")) closeTypeMenu();
  if (t.closest("[data-close]")) {
    ui.pane = null;
    render();
    return;
  }
  if (t.closest("[data-pool]")) {
    // the pool's collapse button, or the strip it collapses to
    ui.poolClosed = !ui.poolClosed;
    return render();
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
        CFG.I.table,
        +note.dataset.id,
        { [CFG.I.urgency]: next || null },
      ],
    ]);
  }
  if (t.closest("[data-unsprint]"))
    return sprintLink(
      +t.closest("[data-unsprint]").dataset.unsprint,
      ...sprintTarget(t),
      false,
    );
  if (t.closest("[data-open]")) {
    // a parent chip in the side pane: open that parent's side pane
    const p = S.all.get(+t.closest("[data-open]").dataset.open);
    ui.pane = { type: p.type, id: p.id };
    ui.confirm = null;
    return render();
  }
  if (t.closest("[data-pooltypes]")) {
    ui.pool.menu = !ui.pool.menu;
    return render();
  }
  if (t.closest("[data-poolview]")) {
    ui.pool.flat = t.closest("[data-poolview]").dataset.poolview === "flat";
    return render();
  }
  if (t.closest(".pane-head, .teff")) return;
  if (t.closest(".draft, .additem")) return;
  if (t.closest("[data-additem]")) {
    const b = t.closest("[data-additem]").dataset,
      types = [...b.types];
    ui.adding = {
      key: b.additem,
      parent: +b.parent,
      sprint: +b.sprint,
      type: types.includes(lastType) ? lastType : b.first,
      text: "",
    };
    return render();
  }
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
    return page.unlink ? page.unlink(s, note) : unlink(s.type, s.id, s.parent);
  }
  if (t.matches("[data-check]")) {
    const id = +note.dataset.id,
      done = t.checked;
    return act([
      [
        "UpdateRecord",
        CFG.I.table,
        id,
        { [CFG.I.status]: done ? DONE : NOT_STARTED },
      ],
    ]);
  }
  if (note) {
    select(note);
    const s = selOf(note);
    // a note on the page opens its side pane; a task in the side pane's checklist, its name
    if (s.id && (!note.closest("#pane") || t.closest(".task .name"))) {
      ui.pane = { type: s.type, id: s.id };
      ui.confirm = null;
      render();
    }
  } else if (t.closest("#board")) select(null);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const val = () =>
    el.value === ""
      ? null
      : el.type === "number"
        ? +el.value
        : el.type === "date"
          ? Date.parse(el.value) / 1000 // "YYYY-MM-DD" parses as UTC midnight, as Grist stores it
          : el.value;
  if (el.matches("[data-addsprint]")) {
    const [type, id] = sprintTarget(el);
    if (el.value === "new") {
      ui.draft = {
        type: "SP",
        text: "",
        forType: type,
        forId: id,
        fields: { [CFG.SP.status]: "Planned", [CFG.SP.items]: ["L", id] },
      };
      return render();
    }
    return el.value && sprintLink(+el.value, type, id, true);
  }
  if (el.matches("[data-pooltype]")) {
    // the pool's Type menu: a level, or (Select all), ticked or unticked
    const k = el.dataset.pooltype,
      hidden = ui.pool.hidden;
    if (k !== "all") el.checked ? hidden.delete(k) : hidden.add(k);
    else if (el.checked) hidden.clear();
    else
      document
        .querySelectorAll("[data-pooltype]:not([data-pooltype=all])")
        .forEach((b) => hidden.add(b.dataset.pooltype));
    return render();
  }
  if (el.matches("[data-hideplanned]")) {
    ui.pool.hidePlanned = el.checked;
    return render();
  }
  if (el.matches("[data-settype]")) {
    const x = S[ui.pane.type].get(ui.pane.id);
    ui.pane = { type: el.value, id: x.id }; // its side pane stays open
    return setType(x, el.value);
  }
  if (el.matches("[data-person]"))
    return toggleAssignee(S.all.get(ui.pane.id), el.dataset.person);
  if (el.matches("[data-assign]"))
    return (
      el.value && toggleAssignee(S.T.get(+noteOf(el).dataset.id), el.value)
    );
  if (el.matches("[data-optional]"))
    return setOptional(+el.dataset.optional, ui.pane.id, el.checked);
  if (el.matches("textarea.title") && !el.value.trim()) return renderPane(); // don't allow blank names
  if (el.matches("[data-field]") && ui.pane)
    act([
      [
        "UpdateRecord",
        tableOf(ui.pane.type),
        ui.pane.id,
        { [el.dataset.field]: val() },
      ],
    ]);
  else if (el.matches("[data-teffort]"))
    act([
      [
        "UpdateRecord",
        CFG.I.table,
        +noteOf(el).dataset.id,
        { [CFG.I.effortEstimate]: val() },
      ],
    ]);
});

document.addEventListener("input", (e) => {
  // grow the name box as you type
  if (e.target.matches("textarea.title, .draft")) grow(e.target);
  if (e.target.matches(".draft")) ui.draft.text = e.target.value;
  if (e.target.matches("[data-poolq]")) {
    ui.pool.text = e.target.value;
    ui.pool.q = asQuery(e.target.value);
    render();
  }
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
  if (!name || !ui.pane?.id || ui.pane.type === "SP") return;
  input.value = "";
  act([addAction("T", name, ui.pane.id)]).then(() =>
    $("#pane form input")?.focus(),
  );
});

// "+ Add item" box (see addItemHTML)
document.addEventListener("mousedown", (e) => {
  const chip = e.target.closest("[data-addtype]");
  if (!chip) return;
  e.preventDefault(); // keep the focus (and the box open) in the name box
  pickType(chip.dataset.addtype);
});
document.addEventListener("submit", (e) => {
  if (!e.target.matches(".additem")) return;
  e.preventDefault();
  addItem(ui.adding);
  ui.adding.text = "";
  $(".additem input").value = "";
});
document.addEventListener("input", (e) => {
  if (e.target.matches(".additem input")) ui.adding.text = e.target.value;
});
document.addEventListener("keydown", (e) => {
  if (!e.target.matches(".additem input")) return;
  if (e.key === "Escape") {
    ui.adding = null;
    render();
  } else if (e.altKey && TYPE_KEYS[e.code]) {
    e.preventDefault();
    pickType(TYPE_KEYS[e.code]);
  }
});
document.addEventListener("focusout", (e) => {
  // clicking away closes the box; switching to another window, or a redraw, keeps it open
  if (
    !e.target.matches(".additem input") ||
    !ui.adding ||
    drawing ||
    !document.hasFocus()
  )
    return;
  const was = ui.adding;
  ui.adding = null;
  addItem(was);
  setTimeout(render); // after the click that moved the focus lands on what it clicked
});

// Hovering a note outlines its other copies (not while dragging).
document.addEventListener("mouseover", (e) => {
  const n = noteOf(e.target);
  document.querySelectorAll(".twin").forEach((x) => x.classList.remove("twin"));
  if (!n || ui.drag || n.dataset.type === "O" || !+n.dataset.id) return;
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
    toast(
      `Copied “${nameOf(s.id)}”. Select ${PASTE_INTO[s.type]} and press ${e.metaKey ? "⌘" : "Ctrl+"}V.`,
    );
    e.preventDefault();
  } else if (mod && e.key === "v" && ui.clip) {
    e.preventDefault();
    if (page.paste?.(ui.clip, s && findEl(s))) return;
    // into the selected item, or a selected sibling's parent, or the side pane's item
    const c = ui.clip;
    let target = null;
    if (s?.id && canParent(s.type, c.type)) target = s.id;
    else if (s?.type === c.type) target = s.parent;
    else if (ui.pane?.id && canParent(ui.pane.type, c.type))
      target = ui.pane.id;
    if (target) link(c.type, c.id, target);
    else if (s?.id && LABEL[s.type])
      toast(`A ${LABEL[c.type]} can't go under a ${LABEL[s.type]}.`);
    else toast(`Select ${PASTE_INTO[c.type]} to paste into.`);
  } else if (
    (e.key === "Delete" || e.key === "Backspace") &&
    s &&
    s.type !== "O" &&
    s.parent
  ) {
    page.unlink ? page.unlink(s, findEl(s)) : unlink(s.type, s.id, s.parent);
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
    // Space: expand/collapse a note that opens (a capability, deliverable, or outcome card)
    if (!$("[data-toggle]", e.target)) return;
    const s = selOf(e.target),
      k = ekey(s.parent, s.id);
    ui.expanded.has(k) ? ui.expanded.delete(k) : ui.expanded.add(k);
    select(e.target);
    render();
    e.preventDefault();
  } else if (e.key === "Escape") {
    select(null);
    ui.pane = null;
    ui.confirm = null;
    askArchive(null);
    render();
  } else if (e.key === "Enter" && e.target.matches("[data-type]")) {
    // (a task in the side pane's checklist opens when its name is clicked)
    (e.target.querySelector(":scope > .name") || e.target).click();
  }
});

// where a copied item can be pasted
const PASTE_INTO = {
  C: "an outcome list",
  D: "a capability or an outcome list",
  T: "a deliverable, capability, or outcome list",
};

// ---- Drag and drop (move) --------------------------------------------------------------------------
// Dragging follows the pointer (pointerdown/move/up) rather than using the browser's drag and drop,
// which can get stuck inside Grist's widget frame: the browser stops sending the widget any input
// until the page is reloaded. A note being dragged is drawn as a faded copy that follows the pointer.
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
  // Otherwise the nearest card, note, or outcome list that can be its parent (appends to it), e.g. a
  // collapsed capability card for a deliverable or task, a deliverable note for a task.
  for (let n = noteOf(e.target); n; n = noteOf(n.parentElement))
    if (canParent(n.dataset.type, d.type) && +n.dataset.id)
      return { into: n, parent: +n.dataset.id };
  return null;
}
// Last resort: anywhere in an outcome list adds a deliverable or task directly to the outcome (in
// the pool, unlinks it).
function laneTarget(e) {
  const lane = e.target.closest("#board .lane"),
    head = lane && $(":scope > .lane-head", lane);
  if (ui.drag && head && canParent(head.dataset.type, ui.drag.type))
    return { into: lane, parent: +head.dataset.id };
  return null;
}

// Where a drag would land (find: dropTarget or the page's; then the optional fallback). Just below a
// list or card, e.g. under its last note or in the gap before the next card, still counts as in it.
const FUZZ = 24; // px
function landing(e, find, fallback) {
  const above = document.elementFromPoint(e.clientX, e.clientY - FUZZ);
  return (
    find(e) ||
    (above &&
      find({ target: above, clientX: e.clientX, clientY: e.clientY })) ||
    fallback?.(e) ||
    null
  );
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
let pointer = null; // last pointer position while dragging, {x, y}; set below
function autoScroll() {
  if (!ui.drag) return (pointer = null);
  const el = pointer && document.elementFromPoint(pointer.x, pointer.y);
  if (el) {
    const board = $("#board"),
      list = el.closest(".lane-body, .tasks"),
      was = [board.scrollLeft, list?.scrollTop];
    if (el.closest("#board")) {
      const r = board.getBoundingClientRect();
      board.scrollLeft += edgeStep(pointer.x, r.left, r.right);
    }
    if (list) {
      const r = list.getBoundingClientRect();
      list.scrollTop += edgeStep(pointer.y, r.top, r.bottom);
    }
    // the pointer is still but what's under it moved: show where the note would land now
    if (board.scrollLeft !== was[0] || list?.scrollTop !== was[1]) showDrop();
  }
  requestAnimationFrame(autoScroll);
}

// Lists (outcomes on the board, sprints on the sprints page) reorder left/right; the order is saved
// in their table's row order (manualSort).
function laneSlot(e) {
  const lanes = [...document.querySelectorAll("#board .lane")].filter(
    (l) =>
      +$(".lane-head", l).dataset.id &&
      $(".lane-head", l).dataset.type === ui.drag.type,
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

// What's under the point (x, y), in the shape over() and the drop targets take.
const under = (x, y) => ({
  target: document.elementFromPoint(x, y),
  clientX: x,
  clientY: y,
});

// Where the dragged note would land at (x, y), marked on the page: a line where it would go in a
// list, or an outline on the list or note it would go into. null if it can't land there.
function over(x, y) {
  clearDrop(); // first, so the old line is neither what's under the pointer nor a place to go
  const e = under(x, y);
  if (!e.target) return null; // outside the widget
  if (ui.drag.lane) {
    if (!e.target.closest("#board")) return null;
    const slot = laneSlot(e);
    marker = document.createElement("div");
    marker.className = "lane-marker";
    $("#board").insertBefore(marker, slot.before || $("#board .add-lane"));
    return slot;
  }
  // A page can decide where items land on the board (the sprints page: in a sprint, or the pool),
  // except on a card or note that can hold them, which takes them as on the outcome board. The side
  // pane always works as usual (reorder tasks, move them between deliverables).
  const paged = page.dropTarget && !e.target.closest("#pane"),
    t = landing(e, dropTarget, paged ? null : laneTarget);
  if (paged && !t?.parent) {
    const p = landing(e, page.dropTarget);
    if (p) {
      p.el.classList.add("drop-into");
      if (p.zone) {
        // where in the list it will land
        marker = document.createElement("div");
        marker.className = "drop-marker";
        p.zone.insertBefore(marker, p.ref);
      }
    }
    return p && { ...p, page: true };
  }
  if (!t) return null;
  if (t.into) {
    t.into.classList.add("drop-into");
    t.index = Infinity;
    return t;
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
    before || t.zone.querySelector(":scope > .add, :scope > .additem") || null,
  );
  return t;
}
// Mark where the note would land under the pointer; the pointer shows when it can't land there.
function showDrop() {
  document.body.classList.toggle("no-drop", !over(pointer.x, pointer.y));
}

// Drop the dragged note at (x, y). (The caller ends the drag.)
function drop(x, y) {
  const d = ui.drag,
    t = over(x, y);
  if (!t) return;
  if (d.lane) {
    const { before, order } = t;
    const at = before
      ? order.indexOf(+$(".lane-head", before).dataset.id)
      : order.length;
    order.splice(at, 0, d.id);
    return act([rowOrderAction(d.type, order)]);
  }
  if (t.page) return page.drop(d, t);
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
  const [from, extra] = page.lift?.(d, t.parent) ?? [d.parent, []];
  move(d.type, d.id, from, t.parent, index, beforeId, extra);
}

const START = 6; // px the pointer moves, button held, before pressing a note becomes dragging it
let press = null, // the note pressed: {el, x, y}; while dragging also dragged, and dx, dy (see below)
  ghost = null, // the copy of the note that follows the pointer
  afterDrag = false; // the click that ends a drag isn't a click on what's under the pointer

function startDrag() {
  const n = press.el,
    r = n.getBoundingClientRect();
  press.dragged = true;
  press.dx = press.x - r.left; // the point grabbed stays under the pointer
  press.dy = press.y - r.top;
  // el: where the drag started (pages can look at its context); lane: a list header (reorders lists)
  ui.drag = { ...selOf(n), el: n, lane: n.matches(".lane-head") };
  ghost = n.cloneNode(true);
  ghost.classList.remove("selected", "open");
  ghost.classList.add("ghost");
  ghost.inert = true; // only a picture: never focused or read out
  ghost.style.width = `${r.width}px`;
  document.body.append(ghost);
  n.classList.add("dragging");
  document.body.classList.add("drag-on");
  requestAnimationFrame(autoScroll);
}

function endDrag() {
  clearDrop();
  ghost?.remove();
  ghost = null;
  ui.drag = null;
  document.body.classList.remove("drag-on", "no-drop");
  document
    .querySelectorAll(".dragging")
    .forEach((x) => x.classList.remove("dragging"));
}
function cancelDrag() {
  press = null;
  if (ui.drag) endDrag();
}

document.addEventListener("pointerdown", (e) => {
  const n = noteOf(e.target);
  // (in a text box, the pointer selects text instead)
  if (
    e.button === 0 &&
    n?.hasAttribute("data-drag") &&
    !e.target.closest("input, select, textarea")
  )
    press = { el: n, x: e.clientX, y: e.clientY };
});
// pressing a note doesn't select its text (dragging it would)
document.addEventListener("selectstart", (e) => press && e.preventDefault());

document.addEventListener("pointermove", (e) => {
  if (!press) return;
  if (!e.buttons) return cancelDrag(); // the button came up where the widget couldn't see it
  if (!press.dragged) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < START) return;
    if (!press.el.isConnected) return (press = null); // redrawn since it was pressed
    startDrag();
  }
  if (!ui.drag) return; // cancelled with Esc; the button is still down
  pointer = { x: e.clientX, y: e.clientY };
  ghost.style.transform = `translate(${e.clientX - press.dx}px, ${e.clientY - press.dy}px)`;
  showDrop();
});

document.addEventListener("pointerup", (e) => {
  if (press?.dragged) {
    afterDrag = true;
    setTimeout(() => (afterDrag = false)); // the click, if any, comes right after pointerup
  }
  press = null;
  if (!ui.drag) return;
  try {
    drop(e.clientX, e.clientY);
  } finally {
    endDrag(); // even if dropping fails: a drag is never left stuck
  }
});
document.addEventListener("pointercancel", cancelDrag);
document.addEventListener("click", (e) => afterDrag && e.stopPropagation(), {
  capture: true,
});
// Esc cancels a drag (before the other key handling, which would also close the side pane)
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape" || !ui.drag) return;
    endDrag();
    e.stopPropagation();
  },
  { capture: true },
);

// The pool list: the items under nothing, each drawn with what's under it, like an outcome list's
// (nested), or every item on its own (flat); outcomes (when levels has them: the sprints page), then
// capabilities, deliverables, and tasks. Its header has its own search box, a type chip per level
// (none picked: all), and Nested / Flat (see ui.pool); the toolbar's search and person menu don't
// apply to it. note: the hint under the title; extra: more header controls. Its < button collapses it
// to a slim strip, which opens it again when clicked; notes dropped on the strip land in the pool as
// usual.
export function poolHTML(note, levels, extra = "") {
  if (ui.poolClosed)
    return `<section class="lane unlinked closed">
    <div class="lane-head" tabindex="0" data-type="O" data-id="0" data-parent="0" data-pool title="Show the pool"><span>›</span><span class="name">Pool</span></div></section>`;
  const p = ui.pool,
    // a level's items in the pool, if it's ticked in the Type menu
    of = (k) =>
      levels.includes(k) && !p.hidden.has(k)
        ? kidsOf(k, 0).map((id) => S[k].get(id))
        : [],
    // flat: what matches the search itself; nested: also what's there for what's under it that
    // matches (outcome and capability cards check that themselves). Tasks show on their own either way
    // (unlike a card's own tasks, which show with their card).
    keep = (x) =>
      visible(x) &&
      (p.flat || x.type === "T" ? matches(x) : x.type !== "D" || hit(x)),
    chip = (value, label, on, title) =>
      `<button type="button" class="type-chip" data-poolview="${value}" aria-pressed="${on}" title="${title}">${label}</button>`,
    shown = levels.filter((k) => !p.hidden.has(k)),
    tick = (value, label, on) =>
      `<label><input type="checkbox" data-pooltype="${value}"${on ? " checked" : ""}> ${label}</label>`,
    // the Type menu (like a spreadsheet's column filter): a button saying which levels show, which
    // opens a list of them to tick
    typeMenu = `<div class="pool-type"><button type="button" class="type-chip" data-pooltypes aria-expanded="${p.menu}">Type: ${
      shown.length === levels.length
        ? "All"
        : shown.map((k) => TYPES[k]).join(", ") || "None"
    } ▾</button>${
      p.menu
        ? `<div class="pool-menu">${tick("all", "(Select all)", shown.length === levels.length)}${levels.map((k) => tick(k, TYPES[k], !p.hidden.has(k))).join("")}</div>`
        : ""
    }</div>`,
    body = drawWith(p, () => {
      const tasks = of("T").filter(keep);
      return `${of("O")
        .filter(keep)
        .map((o) => ocardHTML(o, 0))
        .join("")}${of("C")
        .filter(keep)
        .map((c) => capHTML(c, 0))
        .join("")}
      ${directDelsHTML({
        id: 0,
        kids: {
          D: of("D")
            .filter(keep)
            .map((d) => d.id),
        },
      })}
      ${tasks.length ? `<div class="trows" data-drop="T" data-parent="0">${tasks.map((t) => trowHTML(t, 0)).join("")}</div>` : ""}`;
    });
  return `<section class="lane unlinked">
    <div class="lane-head" tabindex="0" data-type="O" data-id="0" data-parent="0">Pool<button class="pool-x" data-pool title="Hide the pool" aria-label="Hide the pool">‹</button>
      <span class="sub">${note}</span>
      <div class="pool-tools"><input type="search" data-poolq value="${esc(p.text)}" placeholder="Find in the pool" aria-label="Find in the pool">
        ${typeMenu}<div class="type-chips">${chip("nested", "Nested", !p.flat, "Items under nothing, with what's under them")}${chip("flat", "Flat", p.flat, "Every item on its own")}</div>${extra}</div></div>
    <div class="lane-body" data-drop="C" data-parent="0">${body}
      ${addItemHTML("pool", ["C", "D", "T"], 0)}</div></section>`;
}

// Close the pool's Type menu, without redrawing, so the click that closed it goes on to what it
// clicked. Esc closes it too.
function closeTypeMenu() {
  ui.pool.menu = false;
  $(".pool-menu")?.remove();
  $("[data-pooltypes]")?.setAttribute("aria-expanded", "false");
}
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape" || !ui.pool.menu) return;
    closeTypeMenu();
    e.stopPropagation(); // (Esc otherwise also closes the side pane)
  },
  { capture: true },
);

// Draw a page's lists into #board, keeping each list's and the board's scroll position.
let drawing = false; // redrawing (which takes the focus out of the "+ Add item" box)
export function drawBoard(html) {
  const board = $("#board"),
    scroll = [...board.querySelectorAll(".lane-body")].map((e) => e.scrollTop),
    left = board.scrollLeft;
  // typing in the pool's search box: where, so it can carry on in the redrawn one
  const caret = document.activeElement?.matches("[data-poolq]")
    ? document.activeElement.selectionStart
    : null;
  drawing = true;
  board.innerHTML = html;
  drawing = false;
  board
    .querySelectorAll(".lane-body")
    .forEach((e, i) => (e.scrollTop = scroll[i] || 0));
  board.scrollLeft = left;
  const box = caret === null ? null : $("[data-poolq]");
  if (box) {
    box.focus({ preventScroll: true });
    box.setSelectionRange(caret, caret);
  }
  afterRender();
}

// After a page draws its notes: re-mark the selection, draw the side pane, restore focus.
function afterRender() {
  whoMenu();
  if (ui.sel) {
    const el = findEl(ui.sel);
    if (el) el.classList.add("selected");
    else ui.sel = null;
  }
  archiveButton();
  renderPane();
  if (ui.sel && document.activeElement === document.body)
    findEl(ui.sel)?.focus({ preventScroll: true }); // re-render dropped focus; keep arrow keys working
  const draft = $(".draft");
  if (draft && document.activeElement !== draft) {
    grow(draft);
    draft.focus();
    draft.setSelectionRange(draft.value.length, draft.value.length);
  }
  const box = $(".additem input"); // keep typing in the add box across redraws
  if (box && document.activeElement !== box) {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

// ---- Toolbar ---------------------------------------------------------------------------------------
// "Archive done" archives the done items in what's selected: a sprint, or an item and everything
// under it; with nothing selected, everywhere (see doneIn). Its label says where and how many, and it
// asks first.
const archiveScope = () => {
  const s = ui.sel,
    scope = s?.id ? { type: s.type, id: s.id } : null;
  return {
    scope,
    where: !scope
      ? ""
      : scope.type === "SP"
        ? ` in “${S.SP.get(scope.id)?.name}”`
        : ` under “${nameOf(scope.id)}”`,
  };
};
function archiveButton() {
  const { scope, where } = archiveScope(),
    n = doneIn(scope).length,
    b = $("#archiveDone");
  b.textContent = b.title = scope
    ? `Archive ${n} done${where}`
    : `Archive all ${n} done`;
  b.disabled = !n;
}
// Ask before archiving these done items (ids; where, for the question), or (null) stop asking.
let archiving = null;
function askArchive(ask) {
  archiving = ask;
  $("#archiveDone").hidden = !!ask;
  $("#archiveConfirm").hidden = !ask;
  if (ask)
    $("#archiveConfirm").innerHTML =
      `<span>Archive ${ask.ids.length} done item${ask.ids.length === 1 ? "" : "s"}${esc(ask.where)}?</span>` +
      `<button type="button" class="danger" data-archive="go">Archive</button><button type="button" data-archive="cancel">Cancel</button>`;
}
$("#archiveDone").addEventListener("click", () => {
  const { scope, where } = archiveScope();
  askArchive({ ids: doneIn(scope), where });
});
$("#archiveConfirm").addEventListener("click", (e) => {
  const b = e.target.closest("[data-archive]");
  if (!b) return;
  if (b.dataset.archive === "go") archive(archiving.ids, archiving.where);
  askArchive(null);
});
$("#expandAll").addEventListener("click", () => {
  // Open every note that opens (capabilities, deliverables, outcome cards). What's inside a closed one
  // isn't drawn until it opens, so open what's drawn and redraw until nothing new is left to open.
  let opened = true;
  while (opened) {
    opened = false;
    document.querySelectorAll("#board [data-toggle]").forEach((b) => {
      const n = noteOf(b),
        k = ekey(+n.dataset.parent, +n.dataset.id);
      if (ui.expanded.has(k)) return;
      ui.expanded.add(k);
      opened = true;
    });
    render();
  }
});
$("#collapseAll").addEventListener("click", () => {
  ui.expanded.clear();
  render();
});
