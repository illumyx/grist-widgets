/* Filters: the toolbar's search box, person menu, Hide done, and Hide shelved, and which items they
 * let through. The settings are kept here as data (the toolbar's controls update them), so drawing
 * reads them rather than the controls. Used by every page. */

import {
  CFG,
  DONE,
  S,
  shelvedOf,
  assigneesOf,
  esc,
  render,
  $,
} from "./core.js";

// The toolbar's settings: the search text (lowercase), the person menu (Anyone "", a person's
// initials, or UNASSIGNED), and the Hide done and Hide shelved boxes (each page's HTML says how they
// start)
export const filters = {};
function read() {
  filters.q = $("#search").value.trim().toLowerCase();
  filters.who = $("#who").value;
  filters.hideDone = $("#hideDone").checked;
  filters.hideShelved = $("#hideShelved").checked;
}
const update = () => {
  read();
  render();
};
$("#search").addEventListener("input", update);
$("#who").addEventListener("change", update);
$("#hideDone").addEventListener("change", update);
$("#hideShelved").addEventListener("change", update);
read();

export const matches = (x) =>
  !filters.q || x.name.toLowerCase().includes(filters.q);
export const doneOf = (x) => x.row[CFG.I.status] === DONE;
// not hidden by Hide done or Hide shelved
export const unhidden = (x) =>
  !(filters.hideDone && doneOf(x)) && !(filters.hideShelved && shelvedOf(x));
// shown: not hidden, and (if the person menu picks someone) on the way to what it picks (see whoHit)
export const visible = (x) => unhidden(x) && whoHit(x);
// true if any shown task (by id) matches the filter; lets a deliverable be found by its tasks
const taskHit = (ids) =>
  ids.some((t) => visible(S.T.get(t)) && matches(S.T.get(t)));
export const hit = (d) => matches(d) || taskHit(d.kids.T);

// The people on an item: its own assignees, then those on anything shown under it (assignment says
// who will act, so a parent is on whatever its children are). Hide done and Hide shelved decide
// what's shown.
export const peopleOn = (x) => {
  const all = new Set(assigneesOf(x));
  for (const id of x.children) {
    const c = S.all.get(id);
    if (unhidden(c)) peopleOn(c).forEach((p) => all.add(p));
  }
  return all;
};
// The person menu's Unassigned
const UNASSIGNED = "(none)";
// The item itself matches the person menu: that person is assigned to it, or (Unassigned) nobody is
// on it or under it.
const whoSelf = (x) =>
  filters.who === UNASSIGNED
    ? !peopleOn(x).size
    : assigneesOf(x).includes(filters.who);
// Shown by the person menu: it, or anything shown under it, matches (so a card shows for what's
// under it).
const whoHit = (x) =>
  !filters.who ||
  whoSelf(x) ||
  x.children.some((id) => unhidden(S.all.get(id)) && whoHit(S.all.get(id)));
// The item itself matches the search and the person menu. A card or note that doesn't is only shown
// for what's under it that does (and opens to show it).
export const matchesAll = (x) => matches(x) && (!filters.who || whoSelf(x));

// Fill the person menu with Anyone, each person, and Unassigned (only when the people change).
export function whoMenu() {
  const menu = $("#who"),
    values = ["", ...S.people, UNASSIGNED];
  if ([...menu.options].map((o) => o.value).join() === values.join()) return;
  const was = menu.value;
  menu.innerHTML = values
    .map(
      (v) =>
        `<option value="${esc(v)}">${esc(v === "" ? "Anyone" : v === UNASSIGNED ? "Unassigned" : v)}</option>`,
    )
    .join("");
  menu.value = values.includes(was) ? was : "";
  filters.who = menu.value;
}
