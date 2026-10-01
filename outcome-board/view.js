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
  PARENT,
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
  AVAILABLE,
  $,
} from "./core.js";

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
export function addHTML(type, parent) {
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

function delHTML(d, cap) {
  const tasks = d.kids.map((t) => S.T.get(t)),
    done = tasks.filter(doneOf).length;
  const st = d.row[CFG.D.status] || "";
  return `<div class="del${paneIs("D", d.id) ? " open" : ""}" draggable="true" tabindex="0" data-type="D" data-id="${d.id}" data-parent="${cap}" data-status="${esc(st)}"${urgAttr(d.row[CFG.D.urgency])}>
    ${esc(d.name)}${copies(d, "D")}
    <div class="meta">${tasks.length ? `<span>${done}/${tasks.length} tasks</span>` : ""}${st ? `<span>${esc(st)}</span>` : ""}${pills(d)}</div>${metrics(d)}
    ${cap ? `<button class="x" data-unlink title="Remove from this capability" aria-label="Remove from this capability">×</button>` : ""}</div>`;
}

export function capHTML(c, out) {
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
      ${c.row?.[CFG.C.proposed] ? `<span class="pill">${esc(c.row[CFG.C.proposed])}</span>` : ""}${pills(c)}</div>
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
      ${x.id && S.hasSprints ? sprintsHTML(L, x) : ""}
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
        ${S.hasSprints ? `<span class="tsprints">${sprintMenu("T", t)}${pills(t, true)}</span>` : ""}
        <button class="trash" data-delete title="Delete task" aria-label="Delete task">${TRASH}</button>
        ${copies(t, "T")}${x.id ? `<button class="x" data-unlink title="Remove from this deliverable" aria-label="Remove from this deliverable">×</button>` : ""}</div>`;
          })
          .join("") || `<div class="empty">No tasks yet.</div>`
      }</div>
      ${x.id ? `<form data-addtask><input type="text" placeholder="Add a task and press Enter" aria-label="New task"></form>` : ""}`;
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
  if (el.matches("[data-addsprint]")) {
    const [type, id] = sprintTarget(el);
    if (el.value === "new") {
      ui.draft = {
        type: "SP",
        text: "",
        forType: type,
        forId: id,
        fields: { [CFG.SP.status]: "Planned", [CFG[type].table]: ["L", id] },
      };
      return render();
    }
    return el.value && sprintLink(+el.value, type, id, true);
  }
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

// After a page draws its notes: re-mark the selection, draw the side pane, restore focus.
export function afterRender() {
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
