/* Sprints page: the pool, then one list per sprint (start-date order until reordered by hand), each
 * holding the outcomes, capabilities, deliverables, and tasks added to that sprint, laid out like the
 * pool. Anything under an item comes with it, so it shows inside that item rather than again.
 * Drag from the pool (or another sprint) into a sprint to add (move) an item, or within a sprint to
 * reorder it in its group; x, Delete, or dragging back to the pool takes it out; Ctrl/Cmd+V on a
 * selected sprint adds the copied item. "+ Add item" adds a new item (no parent) to a sprint. */

import {
  start,
  S,
  CFG,
  ui,
  page,
  render,
  esc,
  plural,
  nameOf,
  sprintLink,
  unlink,
  toast,
  SPRINT_DONE,
  TYPES,
  act,
  addAction,
  $,
} from "./core.js";
import {
  addHTML,
  capHTML,
  delHTML,
  drawBoard,
  paneIs,
  doneOf,
  visible,
  matches,
  hit,
  poolHTML,
  trowHTML,
} from "./view.js";

ui.showAll = true; // the pool starts with every item ("Hide linked" unticked)
let showCompleted = false;
const X = "Remove from this sprint",
  xButton = `<button class="x" data-unlink title="${X}" aria-label="${X}">×</button>`;

const day = (sec) =>
  new Date(sec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// "+ Add item": a name box with a chip per level. Enter adds the item to the sprint and leaves the box
// open for the next one; Esc closes it, and so does clicking away (adding what was typed).
let adding = null, // {sprint, text}: the sprint whose box is open
  addType = "T", // the level last picked
  drawing = false; // redrawing (which takes the focus out of the box)
const TYPE_KEYS = { KeyO: "O", KeyC: "C", KeyD: "D", KeyT: "T" }; // Alt+O/C/D/T picks the level

function addItemHTML(sp) {
  if (adding?.sprint !== sp.id)
    return `<button class="add" data-additem="${sp.id}">+ Add item</button>`;
  const chips = Object.entries(TYPES)
    .map(
      ([k, name]) =>
        `<button type="button" class="type-chip" tabindex="-1" data-addtype="${k}" aria-pressed="${k === addType}">${name}</button>`,
    )
    .join("");
  return `<form class="additem"><div class="type-chips">${chips}</div>
    <input type="text" value="${esc(adding.text)}" placeholder="Name, then Enter" title="Alt+O/C/D/T picks the type" aria-label="New item"></form>`;
}
function addItem({ sprint, text }) {
  const name = text.trim();
  if (!name) return;
  act(
    [addAction(addType, name, 0, { [CFG.I.sprints]: ["L", sprint] })],
    `Added “${name}” to “${S.SP.get(sprint).name}”.`,
  );
}
function pickType(k) {
  addType = k;
  document
    .querySelectorAll("[data-addtype]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.addtype === k));
}

const outcomeHTML = (o, sp) =>
  `<div class="ocard${paneIs("O", o.id) ? " open" : ""}" draggable="true" tabindex="0" data-type="O" data-id="${o.id}" data-parent="${sp.id}">${esc(o.name)}
    <div class="meta"><span>${plural(o.kids.C.length, "C")}</span></div>${xButton}</div>`;

function sprintHTML(sp) {
  const k = sp.kids,
    // what's in the sprint, on its own or through a parent (outcomes have no status to count)
    items = ["C", "D", "T"].flatMap((type) =>
      [...S[type].values()].filter((x) => x.own.has(sp.id) || x.via.has(sp.id)),
    ),
    // progress: done among the items with nothing under them (a parent's effort is its children's),
    // weighted by effort when every one has an effort (a blank one reads as 0), else counted
    leaves = items.filter((x) => !x.children.length),
    byEffort = leaves.every((x) => x.row[CFG.I.effort] > 0),
    weight = (x) => (byEffort ? x.row[CFG.I.effort] : 1),
    total = leaves.reduce((n, x) => n + weight(x), 0),
    done = leaves.filter(doneOf).reduce((n, x) => n + weight(x), 0),
    dates = [sp.row[CFG.SP.start], sp.row[CFG.SP.end]]
      .filter(Boolean)
      .map(day)
      .join(" - "),
    dels = k.D.map((id) => S.D.get(id))
      .filter(visible)
      .filter(hit),
    body =
      k.O.map((id) => S.O.get(id))
        .filter(matches)
        .map((o) => outcomeHTML(o, sp))
        .join("") +
      k.C.map((id) => capHTML(S.C.get(id), sp.id, X)).join("") +
      (dels.length
        ? `<div class="dels">${dels.map((d) => delHTML(d, sp.id, X)).join("")}</div>`
        : "") +
      k.T.map((id) => S.T.get(id))
        .filter(visible)
        .filter(matches)
        .map((t) => trowHTML(t, sp.id, X))
        .join("");
  const sub = [sp.status, dates].filter(Boolean),
    pct = Math.round((100 * done) / total),
    num = (n) => Math.round(n * 10) / 10,
    progress = total
      ? `<span class="progress" title="${num(done)}/${num(total)}"><span class="bar"><span style="width:${pct}%"></span></span>${pct}%</span>`
      : "";
  return `<section class="lane sprint" style="--sp:${sp.color}">
    <div class="lane-head${paneIs("SP", sp.id) ? " open" : ""}" tabindex="0" data-type="SP" data-id="${sp.id}" data-parent="0" draggable="true" title="Drag to reorder">${esc(sp.name)}
      <span class="sub">${sub.map(esc).join(" · ")}</span>${progress}</div>
    <div class="lane-body">${body || `<div class="empty">Nothing in this sprint yet.</div>`}${addItemHTML(sp)}</div></section>`;
}

page.render = () => {
  drawing = true;
  drawBoard(
    S.hasSprints
      ? poolHTML(
          "Drag notes here to take them out of a sprint",
          ` <label class="toggle"><input type="checkbox" data-hideplanned${ui.hidePlanned ? " checked" : ""}> Hide planned</label>`,
        ) +
          [...S.SP.values()]
            .filter((sp) => showCompleted || sp.status !== SPRINT_DONE)
            .map(sprintHTML)
            .join("") +
          addHTML("SP", 0)
      : `<div class="empty">No Sprints table yet: run bin/extend_schema.py.</div>`,
  );
  drawing = false;
  // keep typing in the add box across redraws
  const box = $(".additem input");
  if (box && document.activeElement !== box) {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
};

// the sprint a note sits in on this page (0: the pool, or the side pane)
const sprintOf = (el) => {
  const lane = el?.closest(".lane.sprint");
  return lane ? +$(".lane-head", lane).dataset.id : 0;
};
const directlyIn = (sid, type, id) => !!S.SP.get(sid)?.kids[type].includes(id);

// a sprint list's notes of one level, in order (its own items, not ones inside a capability)
const GROUP = {
  O: ":scope > .ocard",
  C: ":scope > .cap",
  D: ":scope > .dels > .del",
  T: ":scope > .trow",
};
page.dropTarget = (e) => {
  const lane = e.target.closest("#board .lane");
  if (!lane || !ui.drag) return null; // (ui.drag is null for drags from outside the page)
  const t = { el: lane, sprint: sprintOf(lane) },
    items = t.sprint
      ? [...$(".lane-body", lane).querySelectorAll(GROUP[ui.drag.type])].filter(
          (x) => !x.classList.contains("dragging"),
        )
      : [];
  if (!items.length) return t; // pool, or the group is empty: it goes at the end
  const before = items.find((x) => {
    const r = x.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  });
  const last = items[items.length - 1];
  return {
    ...t,
    before: before && +before.dataset.id,
    zone: (before || last).parentElement,
    ref: before || last.nextSibling,
  };
};
page.drop = (d, t) => {
  const from = sprintOf(d.el),
    direct = directlyIn(from, d.type, d.id);
  if (t.sprint === from) {
    // reorder within the sprint (inherited items have no place of their own to move)
    if (direct) sprintLink(from, d.type, d.id, true, { before: t.before });
  } else if (t.sprint)
    sprintLink(t.sprint, d.type, d.id, true, {
      from: direct ? from : undefined,
      before: t.before,
    });
  else if (direct) sprintLink(from, d.type, d.id, false); // back to the pool
};
page.unlink = (s, note) => {
  const sid = sprintOf(note);
  if (!sid) return unlink(s.type, s.id, s.parent); // e.g. a task in the side pane
  if (directlyIn(sid, s.type, s.id))
    return sprintLink(sid, s.type, s.id, false);
  toast(
    `“${nameOf(s.id)}” is in “${S.SP.get(sid).name}” through a parent; take that out instead.`,
  );
};
page.paste = (clip, el) => {
  const sid = sprintOf(el);
  if (sid) sprintLink(sid, clip.type, clip.id, true);
  return !!sid;
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-additem]");
  if (!b) return;
  adding = { sprint: +b.dataset.additem, text: "" };
  render();
});
document.addEventListener("mousedown", (e) => {
  const chip = e.target.closest("[data-addtype]");
  if (!chip) return;
  e.preventDefault(); // keep the focus (and the box open) in the name box
  pickType(chip.dataset.addtype);
});
document.addEventListener("submit", (e) => {
  if (!e.target.matches(".additem")) return;
  e.preventDefault();
  addItem(adding);
  adding.text = "";
  $(".additem input").value = "";
});
document.addEventListener("input", (e) => {
  if (e.target.matches(".additem input")) adding.text = e.target.value;
});
document.addEventListener("keydown", (e) => {
  if (!e.target.matches(".additem input")) return;
  if (e.key === "Escape") {
    adding = null;
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
    !adding ||
    drawing ||
    !document.hasFocus()
  )
    return;
  const was = adding;
  adding = null;
  addItem(was);
  setTimeout(render); // after the click that moved the focus lands on what it clicked
});

$("#showCompleted").addEventListener("change", (e) => {
  showCompleted = e.target.checked;
  render();
});

start();
