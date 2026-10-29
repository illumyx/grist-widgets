/* Filters: the toolbar's search box, person menu, and Status menu, and which items they let
 * through; and the spreadsheet-style filter menus (the Status menu, the pool's Type menu). The
 * settings are kept here as data (the toolbar's controls update them), so drawing reads them rather
 * than the controls. Used by every page. */

import {
  S,
  STATUSES,
  SHELVED,
  statusOf,
  shelvedOf,
  assigneesOf,
  esc,
  render,
  $,
} from "./core.js";

// ---- Filter menus ----------------------------------------------------------------------------------
// A spreadsheet-style filter menu: a button saying what's ticked ("Type: All ▾") that opens a list of
// values to tick, with (Select all). Each is in menus, by key: {name, values: [[value, label]],
// hidden: the Set of values unticked, open: its list is showing}. Ticking redraws the page; a click
// anywhere else, or Esc, closes the list.
export const menus = {};
export function menuHTML(key) {
  const m = menus[key],
    shown = m.values.filter(([v]) => !m.hidden.has(v)),
    all = shown.length === m.values.length,
    tick = (attr, label, on) =>
      `<label><input type="checkbox" data-tick="${key}" ${attr}${on ? " checked" : ""}> ${esc(label)}</label>`;
  return `<div class="check-menu" data-key="${key}"><button type="button" class="type-chip" data-menu="${key}" aria-expanded="${m.open}">${esc(m.name)}: ${esc(all ? "All" : shown.map(([, label]) => label).join(", ") || "None")} ▾</button>${
    m.open
      ? `<div class="menu-list">${tick("data-all", "(Select all)", all)}${m.values.map(([v, label]) => tick(`value="${esc(v)}"`, label, !m.hidden.has(v))).join("")}</div>`
      : ""
  }</div>`;
}
// Redraw a menu where it is on the page (just it: opening or closing it doesn't redraw the board).
const drawMenu = (key) => {
  const el = $(`.check-menu[data-key="${key}"]`);
  if (el) el.outerHTML = menuHTML(key);
};
// close the open menus except the one with key (if given)
const closeMenus = (key) =>
  Object.entries(menus).forEach(([k, m]) => {
    if (!m.open || k === key) return;
    m.open = false;
    drawMenu(k);
  });
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-menu]"),
    inMenu = e.target.closest(".check-menu");
  closeMenus(inMenu?.dataset.key); // a click anywhere else closes a menu, and goes on to what it clicked
  if (b) {
    const key = b.dataset.menu;
    menus[key].open = !menus[key].open;
    drawMenu(key);
  }
  if (inMenu) e.stopImmediatePropagation(); // (not also a click on the card or list it's in)
});
document.addEventListener("change", (e) => {
  const t = e.target.closest("[data-tick]");
  if (!t) return;
  const key = t.dataset.tick,
    m = menus[key];
  if (!t.hasAttribute("data-all"))
    t.checked ? m.hidden.delete(t.value) : m.hidden.add(t.value);
  else if (t.checked) m.hidden.clear();
  else m.values.forEach(([v]) => m.hidden.add(v));
  drawMenu(key);
  render();
});
// Esc closes an open menu (and only that)
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape" || !Object.values(menus).some((m) => m.open)) return;
    closeMenus();
    e.stopPropagation();
  },
  { capture: true },
);

// ---- The toolbar's settings ------------------------------------------------------------------------
// The search text (lowercase) and the person menu (Anyone "", a person's initials, or UNASSIGNED). The
// Status menu's settings are menus.status; each page's HTML says which statuses start unticked
// (#statusMenu's data-hide).
export const filters = {};
// search text as it's matched: trimmed, lowercase
export const asQuery = (text) => text.trim().toLowerCase();
function read() {
  filters.q = asQuery($("#search").value);
  filters.who = $("#who").value;
}
const update = () => {
  read();
  render();
};
$("#search").addEventListener("input", update);
$("#who").addEventListener("change", update);
read();
menus.status = {
  name: "Status",
  values: STATUSES.map((st) => [st, st]),
  hidden: new Set($("#statusMenu").dataset.hide.split(",")),
  open: false,
};
$("#statusMenu").innerHTML = menuHTML("status");

// The search and person settings drawing reads: the toolbar's, or (while drawWith draws) another
// set's, e.g. the pool's. The Status menu is the toolbar's everywhere.
let active = filters;
export function drawWith(settings, draw) {
  const was = active;
  active = settings;
  try {
    return draw();
  } finally {
    active = was;
  }
}
// drawing flat (the pool's Flat): every item on its own, without what's under it
export const flat = () => !!active.flat;

export const matches = (x) =>
  !active.q || x.name.toLowerCase().includes(active.q);
// The status an item is filtered by: its own; but one that isn't shelved and is only under shelved
// items is filtered by theirs (its first parent's), so it's hidden and shown with them.
const filterStatus = (x) => {
  if (shelvedOf(x) || !x.parents.length) return statusOf(x);
  const above = x.parents.map((id) => filterStatus(S.all.get(id)));
  return above.every((st) => SHELVED.includes(st)) ? above[0] : statusOf(x);
};
// its status is ticked in the Status menu
export const unhidden = (x) => !menus.status.hidden.has(filterStatus(x));
// The item itself passes the Status menu and the person menu.
export const passes = (x) => unhidden(x) && (!active.who || whoSelf(x));
// Shown: it passes, or something under it does (so a card shows for what's under it, and opens to
// show it).
export const visible = (x) =>
  passes(x) || x.children.some((id) => visible(S.all.get(id)));
// true if any shown task (by id) matches the filter; lets a deliverable be found by its tasks
const taskHit = (ids) =>
  ids.some((t) => visible(S.T.get(t)) && matches(S.T.get(t)));
export const hit = (d) => matches(d) || taskHit(d.kids.T);

// The people on an item: its own assignees, then those on anything shown under it (assignment says
// who will act, so a parent is on whatever its children are). The Status menu decides what's shown.
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
  active.who === UNASSIGNED
    ? !peopleOn(x).size
    : assigneesOf(x).includes(active.who);
// Whose work an item is: its own assignees, or if it has none, those of its nearest parents that
// have some (a task under a deliverable assigned to MK is MK's, unless it's assigned to someone else).
export const ownersOf = (x) => {
  const own = assigneesOf(x);
  return new Set(
    own.length ? own : x.parents.flatMap((id) => [...ownersOf(S.all.get(id))]),
  );
};
// The item's work is the person menu's pick's (Unassigned: nobody's); always, for Anyone.
export const forWho = (x) =>
  !active.who ||
  (active.who === UNASSIGNED ? !ownersOf(x).size : ownersOf(x).has(active.who));
// a person menu value as it's shown: Anyone, initials, or Unassigned
const whoName = (v) =>
  v === "" ? "Anyone" : v === UNASSIGNED ? "Unassigned" : v;
// the person menu's pick as it's shown, or "" for Anyone
export const whoPicked = () => (active.who ? whoName(active.who) : "");
// The item itself matches the search, the Status menu, and the person menu. A card or note that
// doesn't is only shown for what's under it that does (and opens to show it).
export const matchesAll = (x) => matches(x) && passes(x);

// Fill the person menu with Anyone, each person, and Unassigned (only when the people change).
export function whoMenu() {
  const menu = $("#who"),
    values = ["", ...S.people, UNASSIGNED];
  if ([...menu.options].map((o) => o.value).join() === values.join()) return;
  const was = menu.value;
  menu.innerHTML = values
    .map((v) => `<option value="${esc(v)}">${esc(whoName(v))}</option>`)
    .join("");
  menu.value = values.includes(was) ? was : "";
  filters.who = menu.value;
}
