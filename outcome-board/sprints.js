/* Sprints page: the pool, then one list per sprint (start-date order until reordered by hand), each
 * holding the outcomes, capabilities, deliverables, and tasks added to that sprint, laid out like the
 * pool (which starts with the outcomes). Anything under an item comes with it, so it shows inside that
 * item rather than again.
 * Drag from the pool (or another sprint) into a sprint to add (move) an item, or within a sprint to
 * reorder it in its group; x, Delete, or dragging back to the pool takes it out; Ctrl/Cmd+V on a
 * selected sprint adds the copied item. Cards link the way they do on the outcome board: dropping or
 * pasting onto one links the item under it, and x, Delete, or dragging to the pool unlinks what's
 * in one. "+ Add item" adds a new item (no parent) to a sprint. */

import {
  start,
  S,
  CFG,
  ui,
  page,
  render,
  esc,
  sprintLink,
  sprintAction,
  unlink,
  canParent,
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
  ocardHTML,
  paneIs,
  poolHTML,
  trowHTML,
} from "./view.js";
import { visible, matches, hit, forWho, whoPicked } from "./filters.js";

let showCompleted = false;
const X = "Remove from this sprint";

function sprintHTML(sp) {
  const k = sp.kids,
    // progress counts the leaves in the sprint, on their own or through a parent, that aren't
    // shelved: the items with nothing under them, or nothing but shelved items (a parent's work is
    // what's under it, so counting it too would count that work twice). An outcome with nothing
    // under it counts too. When the person menu picks someone, only their work counts (see
    // ownersOf). Items are counted, not weighted by effort, since few have one; to weight them
    // again, sum each one's Effort instead of counting it.
    leaves = ["O", "C", "D", "T"].flatMap((type) =>
      [...S[type].values()].filter(
        (x) =>
          (x.own.has(sp.id) || x.via.has(sp.id)) &&
          !shelvedOf(x) &&
          x.children.every((id) => shelvedOf(S.all.get(id))) &&
          forWho(x),
      ),
    ),
    who = whoPicked(),
    counts = STATUSES.map(
      (st) => leaves.filter((x) => statusOf(x) === st).length,
    ),
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
        .map((o) => ocardHTML(o, sp.id, X))
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
  // a bar stacked by status, from done to not started (so it fills from the left as items are
  // done), then the share that's done
  const total = leaves.length,
    pct = Math.round((100 * counts[STATUSES.indexOf(DONE)]) / total),
    stack = STATUSES.map((st, i) => [st, counts[i]]).reverse(),
    tip =
      (who ? `${who}: ` : "") +
      stack.map(([st, n]) => `${st}: ${n}`).join(", "),
    progress = total
      ? `<span class="progress" title="${esc(tip)}" aria-label="${esc(tip)}">${who ? `<span class="who">${esc(who)}</span>` : ""}<span class="bar">${stack
          .map(([st, n]) =>
            n
              ? `<span data-status="${esc(st)}" style="width:${(100 * n) / total}%"></span>`
              : "",
          )
          .join("")}</span>${pct}%</span>`
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
          ["O", "C", "D", "T"],
          `<label class="toggle"><input type="checkbox" data-hideplanned${ui.pool.hidePlanned ? " checked" : ""}> Hide planned</label>`,
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
// a note drawn inside a card on the page (its data-parent is that card's item), not at the top of a
// sprint (its data-parent is the sprint) or the pool
const nested = (el) => !!el.parentElement.closest("#board [data-type]");
// a note at the top of a sprint: an item directly in that sprint
const atTop = (el) => !!sprintOf(el) && !nested(el);

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
// A drop in a sprint or the pool (a card that can hold the note takes it instead: see page.lift).
// Into a sprint adds the item to it, its links unchanged (from the top of another sprint, it moves).
// Into the pool takes it out of the sprint whose top it was at, or else unlinks it from the card (or
// side pane) it was in, as on the outcome board.
page.drop = (d, t) => {
  const from = sprintOf(d.el),
    top = atTop(d.el);
  if (t.sprint && t.sprint === from) {
    // reorder within the sprint (what's in it through a parent has no place of its own to move)
    if (top) sprintLink(from, d.type, d.id, true, { before: t.before });
  } else if (t.sprint)
    sprintLink(t.sprint, d.type, d.id, true, {
      from: top ? from : undefined,
      before: t.before,
    });
  else if (top) sprintLink(from, d.type, d.id, false);
  else unlink(d.type, d.id, d.parent); // (nothing to do from the top of the pool)
};
// A drop on a card links the note under it, as on the outcome board. From the top of a sprint it's
// a new link (it was under no item there), and if the card is in that same sprint, it leaves the top
// (it's in the sprint through the card now); its other sprints don't change.
page.lift = (d, to) => {
  if (!atTop(d.el)) return [d.parent, []];
  const sid = sprintOf(d.el),
    card = S.all.get(to);
  return [
    0,
    card.own.has(sid) || card.via.has(sid)
      ? [sprintAction(sid, d.id, false)]
      : [],
  ];
};
// x or Delete: in a card (or the side pane), unlinks it from that card, as on the outcome board; at
// the top of a sprint, takes it out of the sprint
page.unlink = (s, note) =>
  atTop(note)
    ? sprintLink(sprintOf(note), s.type, s.id, false)
    : unlink(s.type, s.id, s.parent);
// Ctrl/Cmd+V: a selected card that can hold the copied item (or a note of its level inside a card)
// links it there, as on the outcome board; anything else selected in a sprint adds it to the sprint.
page.paste = (clip, el) => {
  const sid = sprintOf(el);
  if (
    !sid ||
    canParent(el.dataset.type, clip.type) ||
    (nested(el) && el.dataset.type === clip.type)
  )
    return false;
  sprintLink(sid, clip.type, clip.id, true);
  return true;
};

$("#showCompleted").addEventListener("change", (e) => {
  showCompleted = e.target.checked;
  render();
});

start();
