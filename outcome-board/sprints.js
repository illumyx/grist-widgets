/* Sprints page: one list per sprint (start-date order until reordered by hand), each holding the
 * outcomes, capabilities, deliverables, and tasks added to that sprint, laid out like the board's
 * pool. Anything under an item comes with it, so it shows inside that item rather than again. */

import {
  start,
  S,
  CFG,
  page,
  render,
  esc,
  plural,
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
} from "./view.js";

page.itemDrag = false; // only the sprint lists themselves can be dragged (to reorder) for now
let showCompleted = false;

const day = (sec) =>
  new Date(sec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const outcomeHTML = (o, sp) =>
  `<div class="ocard${paneIs("O", o.id) ? " open" : ""}" tabindex="0" data-type="O" data-id="${o.id}" data-parent="${sp.id}">${esc(o.name)}
    <div class="meta"><span>${plural(o.kids.length, "C")}</span></div></div>`;

// a task added to the sprint on its own: a small row (click opens its deliverable)
const taskHTML = (t, sp) =>
  `<div class="trow${doneOf(t) ? " done" : ""}" tabindex="0" data-type="T" data-id="${t.id}" data-parent="${sp.id}">
    <input type="checkbox" data-check${doneOf(t) ? " checked" : ""} aria-label="Done"><span class="name">${esc(t.name)}</span></div>`;

function sprintHTML(sp) {
  const k = sp.kids,
    tasks = [...S.T.values()].filter(
      (t) => t.own.has(sp.id) || t.via.has(sp.id),
    ),
    done = tasks.filter(doneOf).length,
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
      k.C.map((id) => capHTML(S.C.get(id), sp.id)).join("") +
      (dels.length
        ? `<div class="dels">${dels.map((d) => delHTML(d, 0)).join("")}</div>`
        : "") +
      k.T.map((id) => S.T.get(id))
        .filter(visible)
        .filter(matches)
        .map((t) => taskHTML(t, sp))
        .join("");
  const sub = [
    sp.status,
    dates,
    tasks.length ? `${done}/${tasks.length} tasks done` : "",
  ].filter(Boolean);
  return `<section class="lane sprint" style="--sp:${sp.color}">
    <div class="lane-head${paneIs("SP", sp.id) ? " open" : ""}" tabindex="0" data-type="SP" data-id="${sp.id}" data-parent="0" draggable="true" title="Drag to reorder">${esc(sp.name)}
      <span class="sub">${sub.map(esc).join(" · ")}</span></div>
    <div class="lane-body">${body || `<div class="empty">Nothing in this sprint yet.</div>`}</div></section>`;
}

page.render = () =>
  drawBoard(
    S.hasSprints
      ? [...S.SP.values()]
          .filter((sp) => showCompleted || sp.status !== SPRINT_DONE)
          .map(sprintHTML)
          .join("") + addHTML("SP", 0)
      : `<div class="empty">No Sprints table yet: run bin/extend_schema.py.</div>`,
  );

$("#showCompleted").addEventListener("change", (e) => {
  showCompleted = e.target.checked;
  render();
});

start();
