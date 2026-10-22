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
  STATUSES,
  DONE,
  statusOf,
  shelvedOf,
  $,
} from "./core.js";
import {
  addHTML,
  addItemHTML,
  capHTML,
  day,
  delHTML,
  drawBoard,
  dueHTML,
  paneIs,
  visible,
  whoHTML,
  matches,
  hit,
  poolHTML,
  trowHTML,
  shelfClass,
  shelfHTML,
  statusAttr,
  typeHTML,
} from "./view.js";

ui.showAll = true; // the pool starts with every item ("Hide linked" unticked)
let showCompleted = false;
const X = "Remove from this sprint",
  xButton = `<button class="x" data-unlink title="${X}" aria-label="${X}">×</button>`;

const outcomeHTML = (o, sp) =>
  `<div class="ocard${shelfClass(o)}${paneIs("O", o.id) ? " open" : ""}" data-drag tabindex="0" data-type="O" data-id="${o.id}" data-parent="${sp.id}"${statusAttr(o)}>${typeHTML("O")}${esc(o.name)}${dueHTML(o)}
    <div class="meta"><span>${plural(o.kids.C.length, "C")}</span>${shelfHTML(o)}${whoHTML(o)}</div>${xButton}</div>`;

function sprintHTML(sp) {
  const k = sp.kids,
    // progress counts every item in the sprint, on its own or through a parent, that isn't shelved:
    // parents as well as what's under them, and outcomes too (one is seldom put in a sprint, so when
    // it is, it means something). Items are counted, not weighted by effort, since few have one; to
    // weight them again, sum each one's Effort instead of counting it, using only the items with
    // nothing under them (a parent's Effort is rolled up from its children's).
    items = ["O", "C", "D", "T"].flatMap((type) =>
      [...S[type].values()].filter(
        (x) => (x.own.has(sp.id) || x.via.has(sp.id)) && !shelvedOf(x),
      ),
    ),
    counts = STATUSES.map((st) => items.filter((x) => statusOf(x) === st).length),
    dates = [sp.row[CFG.SP.start], sp.row[CFG.SP.end]]
      .filter(Boolean)
      .map(day)
      .join(" - "),
    dels = k.D.map((id) => S.D.get(id))
      .filter(visible)
      .filter(hit),
    body =
      k.O.map((id) => S.O.get(id))
        .filter(visible)
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
  // a bar stacked by status, from not started to done, then the share that's done
  const total = items.length,
    pct = Math.round((100 * counts[STATUSES.indexOf(DONE)]) / total),
    tip = STATUSES.map((st, i) => `${st}: ${counts[i]}`).join(", "),
    progress = total
      ? `<span class="progress" title="${tip}" aria-label="${tip}"><span class="bar">${STATUSES.map(
          (st, i) =>
            counts[i]
              ? `<span data-status="${esc(st)}" style="width:${(100 * counts[i]) / total}%"></span>`
              : "",
        ).join("")}</span>${pct}%</span>`
      : "";
  return `<section class="lane sprint" style="--sp:${sp.color}">
    <div class="lane-head${paneIs("SP", sp.id) ? " open" : ""}" tabindex="0" data-type="SP" data-id="${sp.id}" data-parent="0" data-drag title="Drag to reorder">${esc(sp.name)}${dates ? `<span class="dates">${esc(dates)}</span>` : ""}
      <span class="sub">${esc(sp.status)}</span>${progress}</div>
    <div class="lane-body">${body || `<div class="empty">Nothing in this sprint yet.</div>`}${addItemHTML(`SP${sp.id}`, ["O", "C", "D", "T"], 0, sp.id, "T")}</div></section>`;
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
    `“${nameOf(s.id)}” is in “${S.SP.get(sid).name}” through a parent; take that out instead.`,
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
