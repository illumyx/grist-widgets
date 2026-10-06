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
  URGENCY,
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
  poolName,
  render,
  NOT_STARTED,
  TYPES,
  isOptional,
  setOptional,
  typesFor,
  setType,
  PEOPLE,
  assigneesOf,
  toggleAssignee,
  tableOf,
  addAction,
  rowOrderAction,
  $,
  page,
} from "./core.js";

// ---- Rendering -------------------------------------------------------------------------------------
const q = () => $("#search").value.trim().toLowerCase();
const hideDone = () => $("#hideDone").checked;
const hidePool = () => $("#hidePool").checked;
export const matches = (x) => !q() || x.name.toLowerCase().includes(q());
export const doneOf = (x) => x.row[CFG.I.status] === DONE;
export const visible = (x) => !(hideDone() && doneOf(x));
// true if any shown task (by id) matches the filter; lets a deliverable be found by its tasks
const taskHit = (ids) =>
  ids.some((t) => visible(S.T.get(t)) && matches(S.T.get(t)));
export const hit = (d) => matches(d) || taskHit(d.kids.T);
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
// the initials of the people an item is assigned to
export const whoHTML = (x) =>
  assigneesOf(x)
    .map(
      (p) => `<span class="who" title="Assigned to ${esc(p)}">${esc(p)}</span>`,
    )
    .join("");
// "Assign..." menu for a task in the checklist; picking a person assigns or unassigns them
const assignMenu = (t) =>
  `<select data-assign aria-label="Assign"><option value="">Assign...</option>${PEOPLE.map((p) => `<option value="${esc(p)}">${assigneesOf(t).includes(p) ? "✓ " : ""}${esc(p)}</option>`).join("")}</select>`;
// marks a note whose link to the parent it's drawn under is optional
const optHTML = (parent, id) =>
  isOptional(parent, id) ? `<span class="pill">optional</span>` : "";
const urgRank = (u) => URGENCY.indexOf(u || "");
const urgAttr = (u) => (u ? ` data-urgency="${esc(u)}"` : "");
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
  // "+ Add ..." button, or the new note being named in its place
  const d = ui.draft;
  if (d && !d.id && d.type === type && d.parent === parent) {
    const box = draftHTML(LABEL[type], d.text);
    return {
      O: `<section class="lane"><div class="lane-head">${box}</div></section>`,
      SP: `<section class="lane"><div class="lane-head">${box}</div></section>`,
      C: `<div class="cap">${box}</div>`,
      D: `<div class="del">${box}</div>`,
    }[type];
  }
  return `<button class="${LANES.includes(type) ? "add-lane" : "add"}" data-add="${type}" data-parent="${parent}">+ Add ${LABEL[type]}</button>`;
}

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

export function delHTML(d, cap, xTitle = "Remove from this capability") {
  const tasks = d.kids.T.map((t) => S.T.get(t)),
    done = tasks.filter(doneOf).length;
  const st = d.row[CFG.I.status] || "";
  return `<div class="del${paneIs("D", d.id) ? " open" : ""}" draggable="true" tabindex="0" data-type="D" data-id="${d.id}" data-parent="${cap}" data-status="${esc(st)}"${urgAttr(d.row[CFG.I.urgency])}>
    ${esc(d.name)}${copies(d)}
    <div class="meta">${tasks.length ? `<span>${done}/${tasks.length} tasks</span>` : ""}${st ? `<span>${esc(st)}</span>` : ""}${optHTML(cap, d.id)}${whoHTML(d)}${pills(d)}</div>${metrics(d)}
    ${cap ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;
}

// A task shown on its own (directly under a card or list, or in a sprint): a small row. Clicking it
// opens its parent's side pane.
export const trowHTML = (t, parent, xTitle) =>
  `<div class="trow${doneOf(t) ? " done" : ""}" draggable="true" tabindex="0" data-type="T" data-id="${t.id}" data-parent="${parent}">
    <input type="checkbox" data-check${doneOf(t) ? " checked" : ""} aria-label="Done"><span class="name">${esc(t.name)}</span>${optHTML(parent, t.id)}${whoHTML(t)}${xTitle ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;

// A card's or outcome list's own deliverables and tasks (linked directly, skipping a level)
export function directDelsHTML(p, xTitle) {
  const dels = p.kids.D.map((d) => S.D.get(d))
    .filter(visible)
    .filter(hit);
  return dels.length
    ? `<div class="dels" data-drop="D" data-parent="${p.id}">${dels.map((d) => delHTML(d, p.id, xTitle)).join("")}</div>`
    : "";
}
export function directTasksHTML(p, xTitle) {
  const tasks = p.kids.T.map((t) => S.T.get(t)).filter(visible);
  return tasks.length
    ? `<div class="trows" data-drop="T" data-parent="${p.id}">${tasks.map((t) => trowHTML(t, p.id, xTitle)).join("")}</div>`
    : "";
}

export function capHTML(c, out, xTitle = "Remove from this outcome") {
  const special = c.id === 0;
  const dels = c.kids.D.map((d) => S.D.get(d)).filter(visible);
  const shown = dels.filter(hit);
  const ownT = c.kids.T.map((t) => S.T.get(t)).filter(visible);
  const orphanT = special ? kidsOf("T", 0) : [];
  const orphanHit = taskHit(orphanT);
  const filtering = q() && !matches(c); // card is only here for its matching deliverables/tasks
  if (filtering && !shown.length && !orphanHit && !ownT.some(matches))
    return "";
  const cst = special ? "" : c.row[CFG.I.status] || "";
  if (hideDone() && cst === DONE) return "";
  const open = ui.expanded.has(ekey(out, c.id)) || !!filtering;
  const list = filtering ? shown : dels;
  const urg = [...dels, ...ownT]
    .filter((d) => !doneOf(d))
    .map((d) => d.row[CFG.I.urgency])
    .sort((x, y) => urgRank(y) - urgRank(x))[0];
  return `<div class="cap${special ? " special" : ""}${paneIs("C", c.id) && !special ? " open" : ""}" ${special ? "" : 'draggable="true"'} tabindex="0" data-type="C" data-id="${c.id}" data-parent="${out}"${urgAttr(urg)}>
    <div class="cap-title"><button class="chev" data-toggle aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"}">${open ? "▾" : "▸"}</button>${esc(c.name)}</div>
    ${special ? "" : copies(c)}
    <div class="meta"><span>${plural(dels.length, "D")}</span>${ownT.length ? `<span>${plural(ownT.length, "T")}</span>` : ""}${special ? "" : optHTML(out, c.id)}

      ${cst ? `<span class="pill${cst === DONE ? " ok" : ""}">${cst === DONE ? "✓ Available" : esc(cst)}</span>` : ""}
      ${c.row?.[CFG.I.proposed] ? `<span class="pill">${esc(c.row[CFG.I.proposed])}</span>` : ""}${special ? "" : whoHTML(c)}${pills(c)}</div>
    ${special ? "" : metrics(c)}
    ${
      open
        ? `<div class="dels" data-drop="D" data-parent="${special ? 0 : c.id}">${list.map((d) => delHTML(d, special ? 0 : c.id)).join("")}
      ${orphanT.length && (!filtering || orphanHit) ? `<div class="del orphan${paneIs("D", 0) ? " open" : ""}" tabindex="0" data-type="D" data-id="0" data-parent="0">${poolName("T")} (${orphanT.length})</div>` : ""}
      ${special ? "" : addHTML("D", c.id)}</div>
      ${special ? "" : directTasksHTML(c, "Remove from this capability")}`
        : ""
    }
    ${out && !special ? `<button class="x" data-unlink title="${xTitle}" aria-label="${xTitle}">×</button>` : ""}</div>`;
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
          kids: { T: kidsOf("T", 0) },
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
  // a parent's name, with a box to make the link to it optional
  const chip = (q) =>
    `<span class="chip">${esc(nameOf(q))}${S.hasWeights ? ` <label title="Optional for “${esc(nameOf(q))}”"><input type="checkbox" data-optional="${q}"${isOptional(q, x.id) ? " checked" : ""}> optional</label>` : ""}</span>`;
  // Type: levels its parents and children don't allow are greyed out
  const typeField = () => {
    const ok = typesFor(x);
    return `<label class="field"><span>Type</span><select data-settype>${Object.entries(
      TYPES,
    )
      .map(
        ([k, name]) =>
          `<option value="${k}"${k === L ? " selected" : ""}${ok.includes(k) ? "" : ` disabled title="It must be below its parents and above its children"`}>${name}</option>`,
      )
      .join("")}</select></label>`;
  };
  // Assigned: a box per person
  const peopleField = () =>
    `<div class="field"><span>Assigned</span><div class="people">${PEOPLE.map((p) => `<label><input type="checkbox" data-person="${esc(p)}"${assigneesOf(x).includes(p) ? " checked" : ""}> ${esc(p)}</label>`).join("")}</div></div>`;
  const sum = [measure(x, "Impact"), measure(x, "Effort")]
    .filter(Boolean)
    .join(" · ");
  let html = `<div class="pane-head"><div class="kind">${LABEL[L]}</div>${x.id ? `<textarea class="title" data-field="${cfg.name}" rows="1" aria-label="Name">${esc(x.row[cfg.name] ?? "")}</textarea>` : `<h2>${esc(x.name)}</h2>`}
      <button class="x" data-close aria-label="Close">×</button>
      ${x.parents.length ? `<div class="chips">${x.parents.map(chip).join("")}</div>` : ""}
      ${L !== "O" && sum ? `<div class="summary">${sum}</div>` : ""}
      ${x.id && FIELDS[L] ? `<div class="fields">${L === "SP" ? "" : typeField()}${FIELDS[L].map(field).join("")}${L === "SP" ? "" : peopleField()}</div>` : ""}
      ${x.id && S.hasSprints && L !== "SP" ? sprintsHTML(L, x) : ""}
      ${note ? `<div class="pane-note">${esc(note)}</div>` : ""}</div>`;
  if (L !== "SP") {
    // the task checklist: a deliverable's tasks, or a capability's or outcome's direct ones (if any)
    const tasks = x.kids.T.map((t) => S.T.get(t)).filter(visible);
    if (L === "D" || tasks.length)
      html += `<div class="tasks" data-drop="T" data-parent="${x.id}">
      ${
        tasks
          .map((t) => {
            const u = t.row[CFG.I.urgency] || "";
            if (confirming("T", t.id))
              return `<div class="task" data-type="T" data-id="${t.id}" data-parent="${x.id}">${confirmHTML(ui.confirm)}</div>`;
            return `<div class="task${doneOf(t) ? " done" : ""}${q() && matches(t) ? " hit" : ""}" draggable="true" tabindex="0" data-type="T" data-id="${t.id}" data-parent="${x.id}">
        <input type="checkbox" data-check ${doneOf(t) ? "checked" : ""} aria-label="Done">
        ${ui.draft?.id === t.id ? draftHTML(LABEL.T, ui.draft.text) : `<span class="name">${esc(t.name)}</span>${optHTML(x.id, t.id)}${whoHTML(t)}`}
        <button class="urg" data-urg data-u="${esc(u)}" title="Urgency: ${esc(u || "Normal")} (click to change)" aria-label="Urgency: ${esc(u || "Normal")}"></button>
        <input class="teff" type="number" step="any" data-teffort value="${esc(num(t.row[CFG.I.effortEstimate]) ?? "")}" placeholder="effort" aria-label="Effort">
        <span class="tsprints">${assignMenu(t)}${S.hasSprints ? sprintMenu("T", t) + pills(t, true) : ""}</span>
        <button class="trash" data-delete title="Delete task" aria-label="Delete task">${TRASH}</button>
        ${copies(t)}${x.id ? `<button class="x" data-unlink title="Remove from this ${LABEL[L]}" aria-label="Remove from this ${LABEL[L]}">×</button>` : ""}</div>`;
          })
          .join("") || `<div class="empty">No tasks yet.</div>`
      }</div>`;
    if (x.id)
      html += `<form data-addtask><input type="text" placeholder="Add a task and press Enter" aria-label="New task"></form>`;
  }
  if (x.id)
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
    if (s.type === "C" && s.id === 0) {
      ui.expanded.add(ekey(0, 0));
      render();
    } else if (s.type !== "T" && (s.id || s.type === "D")) {
      ui.pane = { type: s.type, id: s.id };
      ui.confirm = null;
      render();
    } else if (s.type === "T" && !note.closest("#pane")) {
      // a task listed on the page (not in the side pane): open its (first) parent
      const p = S.all.get(S.T.get(s.id).parents[0]);
      if (p) {
        ui.pane = { type: p.type, id: p.id };
        render();
      }
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
  if (el.matches("[data-hideplanned]")) {
    ui.hidePlanned = el.checked;
    return render();
  }
  if (el.matches("[data-hidelinked]")) {
    ui.showAll = !el.checked;
    return render();
  }
  if (el.matches("[data-settype]")) {
    // a new task has no side pane of its own: show its parent's instead
    const x = S[ui.pane.type].get(ui.pane.id),
      p = S.all.get(x.parents[0]);
    ui.pane =
      el.value !== "T"
        ? { type: el.value, id: x.id }
        : p && { type: p.type, id: p.id };
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
  if (!name || !ui.pane?.id || ui.pane.type === "SP") return;
  input.value = "";
  act([addAction("T", name, ui.pane.id)]).then(() =>
    $("#pane form input")?.focus(),
  );
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

// where a copied item can be pasted
const PASTE_INTO = {
  C: "an outcome list",
  D: "a capability or an outcome list",
  T: "a deliverable, capability, or outcome list",
};

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
  // Otherwise the nearest card, note, or outcome list that can be its parent (appends to it), e.g. a
  // collapsed capability card for a deliverable or task, a deliverable note for a task.
  for (let n = noteOf(e.target); n; n = noteOf(n.parentElement))
    if (canParent(n.dataset.type, d.type) && +n.dataset.id)
      return { into: n, parent: +n.dataset.id };
  return null;
}
// Last resort: anywhere in an outcome list adds a deliverable or task directly to the outcome.
function laneTarget(e) {
  const lane = e.target.closest("#board .lane"),
    head = lane && $(":scope > .lane-head", lane);
  if (ui.drag && head && canParent(head.dataset.type, ui.drag.type))
    return +head.dataset.id && { into: lane, parent: +head.dataset.id };
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
  // el: where the drag started (pages can look at its context); lane: a list header (reorders lists)
  ui.drag = { ...selOf(n), el: n, lane: n.matches(".lane-head") };
  requestAnimationFrame(autoScroll);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", n.dataset.id);
  requestAnimationFrame(() => n.classList.add("dragging"));
});

// Lists (outcomes on the board, sprints on the sprints page) reorder left/right; the order is saved
// in their table's row order (manualSort).
const LANES = ["O", "SP"];
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

document.addEventListener("dragover", (e) => {
  pointer = { x: e.clientX, y: e.clientY, el: e.target };
  if (ui.drag?.lane) {
    if (!e.target.closest("#board")) return;
    e.preventDefault();
    clearDrop();
    const { before } = laneSlot(e);
    marker = document.createElement("div");
    marker.className = "lane-marker";
    $("#board").insertBefore(marker, before || $("#board .add-lane"));
    return;
  }
  if (page.dropTarget && !e.target.closest("#pane")) {
    // this page decides where items can land on the board (the sprints page); the side pane
    // always works as usual (reorder tasks, move them between deliverables)
    const t = landing(e, page.dropTarget);
    clearDrop();
    if (t) {
      e.preventDefault();
      t.el.classList.add("drop-into");
      if (t.zone) {
        // where in the list it will land
        marker = document.createElement("div");
        marker.className = "drop-marker";
        t.zone.insertBefore(marker, t.ref);
      }
    }
    return;
  }
  const t = landing(e, dropTarget, laneTarget);
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
  if (ui.drag?.lane) {
    e.preventDefault();
    const { before, order } = laneSlot(e),
      { id, type } = ui.drag;
    const at = before
      ? order.indexOf(+$(".lane-head", before).dataset.id)
      : order.length;
    order.splice(at, 0, id);
    clearDrop();
    ui.drag = null;
    act([rowOrderAction(type, order)]);
    return;
  }
  if (page.dropTarget && !e.target.closest("#pane")) {
    const t = landing(e, page.dropTarget),
      d = ui.drag;
    clearDrop();
    ui.drag = null;
    if (t && d) {
      e.preventDefault();
      page.drop(d, t);
    }
    return;
  }
  const t = landing(e, dropTarget, laneTarget),
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

// The pool list: capabilities, then a stand-in card holding the pool's deliverables (and, under it,
// its tasks). note: the hint under the title; extra: more header checkboxes.
export function poolHTML(note, extra = "") {
  if (hidePool()) return "";
  const caps = kidsOf("C", 0).map((c) => S.C.get(c));
  caps.push({
    id: 0,
    name: poolName("D"),
    kids: { D: kidsOf("D", 0), T: [] },
    parents: [],
    row: {},
  });
  return `<section class="lane unlinked">
    <div class="lane-head" tabindex="0" data-type="O" data-id="0" data-parent="0">Pool
      <span class="sub">${note} <label class="toggle"><input type="checkbox" data-hidelinked${ui.showAll ? "" : " checked"}> Hide linked</label>${extra}</span></div>
    <div class="lane-body" data-drop="C" data-parent="0">${caps.map((c) => capHTML(c, 0)).join("")}
      ${addHTML("C", 0)}</div></section>`;
}

// Draw a page's lists into #board, keeping each list's and the board's scroll position.
export function drawBoard(html) {
  const board = $("#board"),
    scroll = [...board.querySelectorAll(".lane-body")].map((e) => e.scrollTop),
    left = board.scrollLeft;
  board.innerHTML = html;
  board
    .querySelectorAll(".lane-body")
    .forEach((e, i) => (e.scrollTop = scroll[i] || 0));
  board.scrollLeft = left;
  afterRender();
}

// After a page draws its notes: re-mark the selection, draw the side pane, restore focus.
function afterRender() {
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

// ---- Toolbar ---------------------------------------------------------------------------------------
$("#search").addEventListener("input", render);
$("#hideDone").addEventListener("change", render);
$("#hidePool").addEventListener("change", render);
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
