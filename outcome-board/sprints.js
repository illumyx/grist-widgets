/* Sprints page: the pool, then one list per sprint (start-date order until reordered by hand), each
 * holding the outcomes, capabilities, deliverables, and tasks added to that sprint, laid out like the
 * pool. Anything under an item comes with it, so it shows inside that item rather than again.
 * Drag from the pool (or another sprint) into a sprint to add (move) an item, or within a sprint to
 * reorder it in its group; x, Delete, or dragging back to the pool takes it out; Ctrl/Cmd+V on a
 * selected sprint adds the copied item. */

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

const outcomeHTML = (o, sp) =>
  `<div class="ocard${paneIs("O", o.id) ? " open" : ""}" draggable="true" tabindex="0" data-type="O" data-id="${o.id}" data-parent="${sp.id}">${esc(o.name)}
    <div class="meta"><span>${plural(o.kids.length, "C")}</span></div>${xButton}</div>`;

// a task added to the sprint on its own: a small row (click opens its deliverable)
const taskHTML = (t, sp) =>
  `<div class="trow${doneOf(t) ? " done" : ""}" draggable="true" tabindex="0" data-type="T" data-id="${t.id}" data-parent="${sp.id}">
    <input type="checkbox" data-check${doneOf(t) ? " checked" : ""} aria-label="Done"><span class="name">${esc(t.name)}</span>${xButton}</div>`;

function sprintHTML(sp) {
  const k = sp.kids,
    // what's in the sprint, on its own or through a parent (outcomes have no status to count)
    items = ["C", "D", "T"].flatMap((type) =>
      [...S[type].values()].filter((x) => x.own.has(sp.id) || x.via.has(sp.id)),
    ),
    done = items.filter(doneOf).length,
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
        .map((t) => taskHTML(t, sp))
        .join("");
  const sub = [
    sp.status,
    dates,
    items.length ? `${done}/${items.length} items done` : "",
  ].filter(Boolean);
  return `<section class="lane sprint" style="--sp:${sp.color}">
    <div class="lane-head${paneIs("SP", sp.id) ? " open" : ""}" tabindex="0" data-type="SP" data-id="${sp.id}" data-parent="0" draggable="true" title="Drag to reorder">${esc(sp.name)}
      <span class="sub">${sub.map(esc).join(" · ")}</span></div>
    <div class="lane-body">${body || `<div class="empty">Nothing in this sprint yet.</div>`}</div></section>`;
}

page.render = () =>
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
    `“${nameOf(s.type, s.id)}” is in “${S.SP.get(sid).name}” through a parent; take that out instead.`,
  );
};
page.paste = (clip, el) => {
  const sid = sprintOf(el);
  if (sid) sprintLink(sid, clip.type, clip.id, true);
  return !!sid;
};

$("#showCompleted").addEventListener("change", (e) => {
  showCompleted = e.target.checked;
  render();
});

start();
