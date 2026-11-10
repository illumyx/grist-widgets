/* In-browser tests for the boards -- dragging notes, statuses and shelved items (the Status menu), the
 * collapsible pool, who items can be assigned to, who's on what's under them, the person menu,
 * tasks' side panes, changing an item's level, tasks in deliverables, and outcomes on the sprints
 * page -- run
 * against the demo data in mock.js. Nothing to install: serve the folder (cd outcome-board &&
 * python -m http.server 8000) and open http://localhost:8000/index.html?test and
 * http://localhost:8000/sprints.html?test -- the results show at the top of the page. The tests
 * change the demo data, so reload to run them again. */

import { S, ui, sprintLink, ekey, render, act } from "./core.js";
import { ownersOf, menus, unhidden } from "./filters.js";

const $ = (s) => document.querySelector(s);
const settle = () => new Promise((r) => setTimeout(r, 50)); // let a change save and redraw
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
// a pointer event at (x, y), sent to what's there, as the browser would; buttons: 1 = held down
function pointer(type, x, y, buttons = 1) {
  document.elementFromPoint(x, y).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
      pointerId: 1,
      isPrimary: true,
      pointerType: "mouse",
    }),
  );
}
// let go at (x, y), with the click the browser sends after it
function release(x, y) {
  pointer("pointerup", x, y, 0);
  document
    .elementFromPoint(x, y)
    .dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }),
    );
}
const del = (cap, id) =>
  $(`#board .cap[data-id="${cap}"] .del[data-id="${id}"]`);
const kidsD = (cap) => S.all.get(cap).kids.D;
const dragDone = () => !ui.drag && !$(".ghost") && !$(".dragging");
// drag the note el and drop it on target
function dragTo(el, target) {
  const from = center(el),
    to = center(target);
  pointer("pointerdown", ...from);
  pointer("pointermove", from[0] + 10, from[1]);
  pointer("pointermove", ...to);
  release(...to);
}
const strip = () => $("#board .lane.unlinked.closed");
// open the capability cards on the page (and not their deliverables, as Expand all would)
function openCaps() {
  document
    .querySelectorAll("#board .cap")
    .forEach((c) => ui.expanded.add(ekey(+c.dataset.parent, +c.dataset.id)));
  render();
}
// the initials on a card, note, or outcome header (not on the notes inside it), "~" marking faded ones
const who = (el) =>
  [...el.querySelectorAll(":scope > .meta > .who, :scope > .who")]
    .map((w) => (w.classList.contains("via") ? "~" : "") + w.textContent)
    .join();
// click the pool's collapse button, and say if it's now a strip
async function closePool() {
  $("#board .lane.unlinked .pool-x").click();
  await settle();
  return !!strip() && !$("#board .lane.unlinked .lane-body");
}
// choose a value in a menu, as if picked by hand
function chooseIn(menu, value) {
  menu.value = value;
  menu.dispatchEvent(new Event("change", { bubbles: true }));
}
// ... in one of the side pane's menus
const choose = (field, value) =>
  chooseIn($(`#pane select[data-field="${field}"]`), value);
// ... in the toolbar's person menu, by its label (Anyone, initials, Unassigned)
const showFor = (label) =>
  chooseIn(
    $("#who"),
    [...$("#who").options].find((o) => o.text === label).value,
  );
// type text into the pool's search box, as if typed there
async function poolSearch(text) {
  const box = $("[data-poolq]");
  box.focus();
  box.value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
}
// the pool's notes at its top (not the ones inside cards), e.g. "O1,C4"
const poolTop = () =>
  [
    ...$("#board .lane.unlinked .lane-body").querySelectorAll(
      ":scope > [data-type], :scope > .dels > [data-type], :scope > .trows > [data-type]",
    ),
  ]
    .map((n) => n.dataset.type + n.dataset.id)
    .join();
// click the pool's Nested or Flat ("nested", "flat")
async function poolChip(value) {
  $(`#board .lane.unlinked [data-poolview="${value}"]`).click();
  await settle();
}
// tick or untick a value ("C"; "all": (Select all)) in a filter menu ("type": the pool's Type menu,
// "status": the toolbar's Status menu), opening it first
async function menuTick(key, value) {
  if (!menus[key].open) {
    $(`[data-menu="${key}"]`).click();
    await settle();
  }
  $(
    value === "all"
      ? `[data-tick="${key}"][data-all]`
      : `[data-tick="${key}"][value="${value}"]`,
  ).click();
  await settle();
}
const poolType = (value) => menuTick("type", value);
const SHELVED = ["Dropped", "Tabled", "Paused", "Archived"],
  ACTIVE = ["Not Started", "In Progress", "Under Review", "Done"];
// set the toolbar's Status menu to show just these statuses (then close it)
async function showStatuses(...statuses) {
  for (const [st] of menus.status.values)
    if (menus.status.hidden.has(st) === statuses.includes(st))
      await menuTick("status", st);
  if (menus.status.open) $('[data-menu="status"]').click();
  await settle();
}
// the notes at the top of a list (the list whose header is the one with type and id), not those
// inside cards, e.g. "C2,D5,T10"
const listTop = (type, id) =>
  [
    ...$(`#board .lane-head[data-type="${type}"][data-id="${id}"]`)
      .parentElement.querySelector(".lane-body")
      .querySelectorAll(
        ":scope > [data-type], :scope > .dels > [data-type], :scope > .trows > [data-type]",
      ),
  ]
    .map((n) => n.dataset.type + n.dataset.id)
    .join();
// the toolbar's Nested or Flat ("nested", "flat")
async function listView(value) {
  $(`[data-listview="${value}"]`).click();
  await settle();
}
// Ctrl+key on the selected note (Ctrl+C copies it, Ctrl+V pastes)
const pressCtrl = (key) =>
  $("#board .selected").dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }),
  );
// set an item's status from its side pane, which stays open
async function setStatus(id, status) {
  ui.pane = { type: S.all.get(id).type, id };
  render();
  choose("Status", status);
  await settle();
}

const results = [];
function check(name, ok) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

async function run() {
  while (!$("#board .del")) await settle(); // the board has loaded
  if (document.body.classList.contains("sprints-page")) return sprintsTests();
  openCaps();
  await settle();
  await flatListTests();
  await dragTests();
  await shelvedTests();
  await poolTests();
  await peopleTests();
  await inheritedTests();
  await whoFilterTests();
  await taskPaneTests();
  await typeTests();
  await delTasksTests();
}

// Outcome board. Demo data: capability 2 holds deliverable 5; capability 3 holds 5 and 6 (which has
// task 10).
async function dragTests() {
  // a click that wobbles a little still opens the side pane, and doesn't drag
  const [x, y] = center(del(3, 6));
  pointer("pointerdown", x, y);
  pointer("pointermove", x + 3, y + 2);
  release(x + 3, y + 2);
  await settle();
  check(
    "a click opens the side pane",
    ui.pane?.type === "D" && ui.pane.id === 6,
  );
  check("a click doesn't drag", dragDone());

  // dragging deliverable 6 from capability 3 onto capability 2, below deliverable 5
  const from = center(del(3, 6));
  pointer("pointerdown", ...from);
  pointer("pointermove", from[0] + 10, from[1]);
  check(
    "moving 6px starts a drag, with a copy following the pointer",
    ui.drag?.id === 6 &&
      !!$(".ghost") &&
      del(3, 6).classList.contains("dragging"),
  );
  const r = del(2, 5).getBoundingClientRect(),
    to = [r.left + r.width / 2, r.bottom - 4];
  pointer("pointermove", ...to);
  check(
    "a line marks where it would land",
    !!$("#board .cap[data-id='2'] .drop-marker"),
  );
  release(...to);
  await settle();
  check(
    "dropping moves it",
    kidsD(2).join() === "5,6" && kidsD(3).join() === "5",
  );
  check("dropping ends the drag", dragDone());
  check("the click that ends a drag is ignored", ui.pane?.id === 6);

  // Esc cancels a drag; letting go afterwards changes nothing
  const c = center(del(2, 5)),
    pool = center($("#board .lane.unlinked .lane-body"));
  pointer("pointerdown", ...c);
  pointer("pointermove", ...pool);
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  check("Esc cancels a drag", dragDone());
  check("Esc during a drag keeps the side pane open", ui.pane?.id === 6);
  release(...pool);
  await settle();
  check("letting go after Esc changes nothing", kidsD(2).join() === "5,6");

  // the button coming up where the widget can't see it (e.g. outside the frame) ends the drag
  const d = center(del(2, 5));
  pointer("pointerdown", ...d);
  pointer("pointermove", d[0], d[1] + 20);
  pointer("pointermove", d[0], d[1] + 30, 0); // moving with no button held
  await settle();
  check("a release the widget missed ends the drag", dragDone());
  check("... and changes nothing", kidsD(2).join() === "5,6");

  // pressing in a text box (a task's effort, in the side pane) selects text instead of dragging
  const eff = center($('#pane .task[data-id="10"] .teff'));
  pointer("pointerdown", ...eff);
  pointer("pointermove", eff[0] + 30, eff[1]);
  check("pressing in a text box doesn't drag", !ui.drag);
  pointer("pointerup", eff[0] + 30, eff[1], 0);
}

// Outcome board, at the start: outcome 1 holds capabilities 2 and 3; 2 holds deliverable 5, and 3
// holds 5 and 6; 5 has tasks 8 (done, DR's), 9, and 11 (tabled), and 6 has task 10.
async function flatListTests() {
  const lane = () => $('#board .lane-head[data-id="1"]').parentElement,
    search = async (text) => {
      $("#search").value = text;
      $("#search").dispatchEvent(new Event("input"));
      await settle();
    };
  await listView("flat");
  check(
    "flat, an outcome list shows everything under it that the filters let through, once each",
    listTop("O", 1) === "C2,C3,D5,D6,T8,T9,T10",
  );
  check(
    "... each on its own, with no arrow",
    !lane().querySelector(".lane-body [data-type] [data-type]") &&
      !lane().querySelector("[data-toggle]"),
  );
  const t10 = lane().querySelector('.trow[data-id="10"]');
  check(
    "... and under the parent it's linked through (task 10: deliverable 6)",
    t10.dataset.parent === "6" &&
      t10.querySelector(".x").title === "Remove from this deliverable",
  );
  await search("page");
  check(
    "... the filter shows just the items that match (deliverable 5, task 9)",
    listTop("O", 1) === "D5,T9",
  );
  await search("");
  showFor("DR");
  await settle();
  check("... and so does the person menu (task 8)", listTop("O", 1) === "T8");
  showFor("Anyone");
  await listView("nested");
  check(
    "Nested goes back: the capability cards, with what's under them",
    listTop("O", 1) === "C2,C3" && !!lane().querySelector("[data-toggle]"),
  );
}

// Outcome board, after dragTests (deliverable 6 is now on capability 2). Demo data: capability 4 is
// dropped; deliverable 5 has tasks 8 (done), 9, and 11 (tabled); deliverable 6 is in Sprint 3, so
// its task 10 is too; deliverable 7 is overdue.
async function shelvedTests() {
  const shown = (sel) => !!$(`#board ${sel}`);
  check(
    "the Status menu starts with the shelved statuses unticked",
    SHELVED.every((st) => menus.status.hidden.has(st)) &&
      ACTIVE.every((st) => !menus.status.hidden.has(st)),
  );
  check("a dropped capability is hidden", !shown('.cap[data-id="4"]'));
  del(2, 5).click();
  await settle();
  check(
    "a tabled task is left out of its deliverable's checklist",
    !$('#pane .task[data-id="11"]') && !!$('#pane .task[data-id="9"]'),
  );
  check(
    "... and its task count",
    del(2, 5).querySelector(".meta").textContent.includes("1/2 tasks"),
  );

  await showStatuses(...SHELVED, ...ACTIVE);
  const cap4 = $('#board .cap[data-id="4"]');
  check(
    "ticked, shelved items show, faded and tagged with their status",
    cap4?.classList.contains("shelved") &&
      cap4.querySelector(".shelf")?.textContent === "Dropped" &&
      $('#pane .task[data-id="11"] .shelf')?.textContent === "Tabled",
  );
  await showStatuses(...ACTIVE);

  // tabling deliverable 6 from its side pane, then taking it up again
  del(2, 6).click();
  await settle();
  const menu = $('#pane select[data-field="Status"]');
  check(
    "the side pane's Status menu has every status, in order",
    [...menu.options].map((o) => o.text).join() ===
      "Dropped,Tabled,Not Started,In Progress,Paused,Under Review,Done,Archived" &&
      menu.value === "Not Started",
  );
  const before = S.T.get(10).via.has(3);
  choose("Status", "Tabled");
  await settle();
  check(
    "tabling it from the side pane saves it and hides it",
    S.D.get(6).row.Status === "Tabled" && !del(2, 6),
  );
  check(
    "a shelved item doesn't bring what's under it into its sprint",
    before && !S.T.get(10).via.has(3),
  );
  check(
    "what's only under a tabled item is filtered as tabled too (task 10)",
    !unhidden(S.T.get(10)),
  );
  await showStatuses("Tabled");
  check(
    "with only Tabled ticked, the tabled items show, in the cards they're in (as context)",
    !!del(2, 6) &&
      !!del(3, 5)?.querySelector('.trow[data-id="11"]') &&
      !del(3, 5).querySelector('.trow[data-id="9"]') &&
      unhidden(S.T.get(10)),
  );
  check(
    "... and the menu's button says what's ticked",
    $('[data-menu="status"]').textContent.includes("Status: Tabled"),
  );
  await showStatuses(...ACTIVE);
  choose("Status", "Not Started");
  await settle();
  check(
    "choosing Not Started takes it up again",
    S.D.get(6).row.Status === "Not Started" &&
      !!del(2, 6) &&
      S.T.get(10).via.has(3),
  );

  // an overdue item that's shelved isn't shown as late
  const late = () => !!$('#board .del[data-id="7"] .due.late');
  check("an overdue item shows as late", late());
  $('#board .del[data-id="7"]').click();
  await settle();
  await showStatuses(...SHELVED, ...ACTIVE); // to see it once it's dropped
  choose("Status", "Dropped");
  await settle();
  check(
    "... but not once it's shelved",
    shown('.del[data-id="7"].shelved') && !late(),
  );
  await showStatuses(...ACTIVE);
}

// Outcome board, after shelvedTests: deliverable 5 is on capabilities 2 and 3.
async function poolTests() {
  check(
    "the pool's collapse button collapses it to a strip",
    await closePool(),
  );
  dragTo(del(2, 5), strip());
  await settle();
  check(
    "dropping a note on the strip unlinks it (and doesn't open the pool)",
    !kidsD(2).includes(5) && kidsD(3).includes(5) && !!strip(),
  );
  $("#board .lane.unlinked.closed .lane-head").click();
  await settle();
  check(
    "clicking the strip opens the pool",
    !strip() && !!$("#board .lane.unlinked .lane-body"),
  );
  $('[data-menu="type"]').click();
  await settle();
  check(
    "the pool's Type menu here lists capability, deliverable, and task",
    [...document.querySelectorAll('[data-tick="type"]')]
      .map((b) => (b.hasAttribute("data-all") ? "all" : b.value))
      .join() === "all,C,D,T",
  );
  $('[data-menu="type"]').click();
  await settle();
}

// Outcome board, after poolTests: deliverable 6 is on capability 2, with task 10. The demo's
// Assignees choices (in mock.js) are MK, DR, and SU.
async function peopleTests() {
  del(2, 6).click();
  await settle();
  const boxes = [...document.querySelectorAll("#pane [data-person]")];
  check(
    "the side pane's Assigned boxes are the Assignees choices in Grist",
    boxes.map((b) => b.dataset.person).join() === "MK,DR,SU",
  );
  check(
    "... and so is a checklist task's Assign menu",
    [...$('#pane .task[data-id="10"] select[data-assign]').options]
      .map((o) => o.value)
      .join() === ",MK,DR,SU",
  );
  boxes[2].click();
  await settle();
  check(
    "ticking a box assigns that person",
    S.D.get(6).row.Assignees.includes("SU") &&
      del(2, 6).querySelector(".who")?.textContent === "SU",
  );
}

// Outcome board, after peopleTests: outcome 1 holds capabilities 2 (with deliverable 6, now SU's) and
// 3 (with deliverable 5, MK's, whose done task 8 is DR's).
async function inheritedTests() {
  const cap = (id) => $(`#board .cap[data-id="${id}"]`);
  check(
    "a card shows, faded, the people on what's under it",
    who(cap(2)) === "~SU",
  );
  check(
    "... after its own, and from more than one level down",
    who(del(3, 5)) === "MK,~DR" && who(cap(3)) === "~MK,~DR",
  );
  check(
    "... up to the outcome",
    who($('#board .lane-head[data-id="1"]')) === "~SU,~MK,~DR",
  );
  await showStatuses("Not Started", "In Progress", "Under Review");
  check(
    "the people on hidden (done) items aren't counted",
    who(del(3, 5)) === "MK" && who(cap(3)) === "~MK",
  );
  await showStatuses(...ACTIVE);
}

// Outcome board, after inheritedTests (see there). Deliverable 5 also has task 9, and deliverable
// 6 task 10, neither of them assigned.
async function whoFilterTests() {
  const cap = (id) => $(`#board .cap[data-id="${id}"]`);
  check(
    "the person menu lists Anyone, the people, and Unassigned",
    [...$("#who").options].map((o) => o.text).join() ===
      "Anyone,MK,DR,SU,Unassigned",
  );
  $("#collapseAll").click();
  showFor("SU");
  await settle();
  check("picking a person shows only what they're on", !!cap(2) && !cap(3));
  check("... opening a card that's there for what's under it", !!del(2, 6));
  showFor("DR");
  await settle();
  check("... which can be further down (task 8, done)", !!del(3, 5) && !cap(2));
  await showStatuses("Not Started", "In Progress", "Under Review");
  check("... unless it's hidden", !$('#board .lane-head[data-id="1"]'));
  await showStatuses(...ACTIVE);
  showFor("Unassigned");
  await settle();
  check(
    "Unassigned shows what has an unassigned item under it",
    !!del(3, 5) && !!del(2, 6),
  );
  del(3, 5).click();
  await settle();
  check(
    "... and highlights, without hiding, unassigned tasks in the side pane",
    $('#pane .task[data-id="9"]').classList.contains("hit") &&
      !$('#pane .task[data-id="8"]').classList.contains("hit"),
  );
  del(2, 6).click();
  await settle();
  chooseIn($('#pane .task[data-id="10"] select[data-assign]'), "MK");
  await settle();
  check("... and hides what's all assigned", !cap(2) && !!cap(3));
  showFor("Anyone");
  await settle();
  check("Anyone shows everything again", !!cap(2) && !!cap(3));
}

// Outcome board, after whoFilterTests: deliverable 5 (on capability 3) has tasks 8 and 9 (and 11,
// tabled, which is hidden).
async function taskPaneTests() {
  openCaps();
  await settle();
  del(3, 5).click();
  await settle();
  $('#pane .task[data-id="8"] select[data-assign]').click();
  await settle();
  check(
    "clicking a menu on a checklist task leaves the side pane as it is",
    ui.pane?.type === "D" && ui.pane.id === 5,
  );
  $('#pane .task[data-id="9"] .name').click();
  await settle();
  check(
    "clicking a checklist task's name opens its own side pane",
    ui.pane?.type === "T" &&
      ui.pane.id === 9 &&
      !!$('#pane select[data-field="Status"]'),
  );
  choose("Status", "Tabled");
  await settle();
  check("... where it can be tabled", S.T.get(9).row.Status === "Tabled");
  $('#pane .chip [data-open="5"]').click();
  await settle();
  check(
    "a parent chip opens the parent's side pane",
    ui.pane?.type === "D" && ui.pane.id === 5 && !$('#pane .task[data-id="9"]'),
  );
  const t8 = $('#pane .task[data-id="8"]');
  t8.focus();
  t8.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await settle();
  check(
    "Enter on a checklist task opens it too",
    ui.pane?.type === "T" && ui.pane.id === 8,
  );
}

// Outcome board, after taskPaneTests: task 8's side pane is open. It's under deliverable 5, which is
// on capability 3 ("A consultant can email respondents"), in outcome 1.
async function typeTests() {
  const types = () =>
    [...$("#pane select[data-settype]").options]
      .map((o) => (o.disabled ? "-" : "") + o.text)
      .join();
  check(
    "a level its parent can't hold is marked (moves up)",
    types() ===
      "Outcome (moves up),Capability (moves up),Deliverable (moves up),Task",
  );
  $('#pane [data-optional="5"]').click();
  await settle();
  const marked = S.optional.has("5:8");
  chooseIn($("#pane select[data-settype]"), "D");
  await settle();
  check(
    "choosing it moves the item up past that parent",
    S.D.get(8)?.parents.join() === "3" &&
      !S.all.get(5).row.Children.includes(8) &&
      ui.pane?.type === "D" &&
      ui.pane.id === 8,
  );
  check(
    "... drops the optional mark on the link it left",
    marked && !S.optional.has("5:8"),
  );
  check(
    "... and says where it went",
    $("#toast").textContent.includes(
      "is now a deliverable, under \u201cA consultant can email respondents",
    ),
  );
  chooseIn($("#pane select[data-settype]"), "O");
  await settle();
  check(
    "with nothing above that can hold it, it becomes an outcome list",
    !!S.O.get(8) &&
      !S.O.get(8).parents.length &&
      ![...S.all.values()].some((y) => y.row.Children?.includes(8)) &&
      !!$('#board .lane-head[data-id="8"]'),
  );
  del(3, 5).click();
  await settle();
  check(
    "a level its children can't sit under is greyed out",
    types() === "Outcome (moves up),Capability (moves up),Deliverable,-Task",
  );
}

// Outcome board, after typeTests: deliverable 6 (on capability 2) has task 10 ("Draft copy");
// deliverable 5 (on capability 3) has tasks 9 and 11, both tabled.
async function delTasksTests() {
  const row = (cap, d, t) =>
    del(cap, d)?.querySelector(`.trow[data-id="${t}"]`);
  check("a deliverable starts closed", !!del(2, 6) && !row(2, 6, 10));
  del(2, 6).querySelector("[data-toggle]").click();
  await settle();
  check("its arrow opens it, showing its tasks as rows", !!row(2, 6, 10));
  dragTo(row(2, 6, 10), del(3, 5));
  await settle();
  check(
    "a task row can be dragged onto another deliverable",
    S.T.get(10).parents.join() === "5",
  );
  del(3, 5).focus();
  del(3, 5).dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true }),
  );
  await settle();
  check("Space opens a deliverable too", !!row(3, 5, 10));

  // with the filter matching task 10 and not the deliverable, it opens by itself to just that task
  await showStatuses(...SHELVED, ...ACTIVE); // to show tabled task 9
  $("#collapseAll").click();
  const search = $("#search");
  search.value = "draft";
  search.dispatchEvent(new Event("input"));
  await settle();
  check(
    "a filter opens a deliverable to just its matching tasks",
    !!row(3, 5, 10) && !row(3, 5, 9),
  );
  search.value = "";
  search.dispatchEvent(new Event("input"));
  await showStatuses(...ACTIVE);

  $("#collapseAll").click();
  $("#expandAll").click();
  await settle();
  check(
    "Expand all opens deliverables, not just capabilities",
    !!row(3, 5, 10),
  );
}

// Sprints page. Demo data: capability 4 (dropped) is in the pool; Sprint 2 holds capability 2, so
// also its deliverable 5 and 5's tasks 8 (done), 9, and 11 (tabled); and task 10.
async function sprintsTests() {
  // flat: Sprint 2 holds capability 2 (so deliverable 5 and its tasks) and task 10; done task 8 and
  // tabled task 11 are hidden
  await listView("flat");
  const t9 = $('#board .lane.sprint .trow[data-id="9"]'),
    t10 = $('#board .lane.sprint .trow[data-id="10"]');
  check(
    "flat, a sprint shows what's in it, directly or through a parent, once each",
    listTop("SP", 2) === "C2,D5,T10,T9",
  );
  check(
    "... its own items' x takes them out of the sprint, the others' out of their parent",
    t10.dataset.parent === "2" &&
      t10.querySelector(".x").title === "Remove from this sprint" &&
      t9.dataset.parent === "5" &&
      t9.querySelector(".x").title === "Remove from this deliverable",
  );
  await listView("nested");
  check("Nested goes back", listTop("SP", 2) === "C2,T10");
  const pool = (sel) => !!$(`#board .lane.unlinked ${sel}`),
    progress = (sid) =>
      $(`#board .lane-head[data-id="${sid}"] .progress`)?.textContent,
    // a sprint's progress bar, by status: "Done 33%, Not Started 67%" (widths rounded)
    bar = (sid) =>
      [...$(`#board .lane-head[data-id="${sid}"] .progress .bar`).children]
        .map(
          (s) =>
            `${s.dataset.status} ${Math.round(parseFloat(s.style.width))}%`,
        )
        .join(", ");
  check(
    "a sprint's progress counts its leaves, on their own or through a parent, leaving out shelved ones (task 8 of 8, 9, 10 done)",
    progress(2) === "33%",
  );
  check(
    "... stacked by status, done first: a blank one counts as Not Started",
    bar(2) === "Done 33%, Not Started 67%",
  );
  // whose work: task 8 is DR's; task 9 has nobody, so it's MK's, like its deliverable 5; task 10
  // has nobody, nor does anything above it
  const owners = (id) => [...ownersOf(S.T.get(id))].join();
  check(
    "an item is the work of its assignees, else of its nearest parents' that have some",
    owners(8) === "DR" && owners(9) === "MK" && owners(10) === "",
  );
  const whoOnBar = (sid) =>
    $(`#board .lane-head[data-id="${sid}"] .progress .who`)?.textContent;
  showFor("MK");
  await settle();
  check(
    "picking a person, a sprint's bar counts just their work, and says whose (task 9)",
    bar(2) === "Not Started 100%" && whoOnBar(2) === "MK",
  );
  showFor("DR");
  await settle();
  check("... (task 8)", bar(2) === "Done 100%" && whoOnBar(2) === "DR");
  showFor("Unassigned");
  await settle();
  check(
    "... Unassigned, the work that's nobody's (task 10)",
    bar(2) === "Not Started 100%" && whoOnBar(2) === "Unassigned",
  );
  showFor("Anyone");
  await settle();
  check(
    "... and Anyone, everyone's again",
    bar(2) === "Done 33%, Not Started 67%" && !whoOnBar(2),
  );
  // with tasks 8 and 9 archived (and 11 tabled), deliverable 5 has nothing unshelved under it
  await setStatus(8, "Archived");
  await setStatus(9, "Archived");
  check(
    "an item with only shelved items under it counts as a leaf (5, in progress, and 10)",
    bar(2) === "In Progress 50%, Not Started 50%",
  );
  await setStatus(8, "Done");
  await setStatus(9, "Not Started");
  $("#pane [data-close]").click();
  await settle();
  check(
    "here the Status menu starts with Done unticked too, and the shelved statuses, hiding a dropped capability",
    [...SHELVED, "Done"].every((st) => menus.status.hidden.has(st)) &&
      !pool('.cap[data-id="4"]'),
  );
  await showStatuses(...SHELVED, "Not Started", "In Progress", "Under Review");
  check("ticked, it shows, faded", pool('.cap[data-id="4"].shelved'));

  // a task row opens the task's side pane (not its parent's)
  $('#board .lane.sprint .trow[data-id="10"]').click();
  await settle();
  check(
    "clicking a task row opens its own side pane",
    ui.pane?.type === "T" && ui.pane.id === 10,
  );
  $("#pane [data-close]").click();
  await settle();

  // dragging task 10 out of Sprint 2 onto the collapsed pool takes it out of the sprint
  check("the pool collapses here too", await closePool());
  dragTo($('#board .lane.sprint .trow[data-id="10"]'), strip());
  await settle();
  check(
    "dropping on the collapsed pool takes an item out of its sprint",
    !S.SP.get(2).items.includes(10),
  );

  // an outcome in a sprint shows the people on what's under it (task 8, DR's, is done: hidden here)
  sprintLink(3, "O", 1, true);
  await settle();
  check(
    "an outcome in a sprint brings its leaves into its progress (task 8 of 8, 9, 10 done)",
    progress(3) === "33%",
  );
  check(
    "an outcome card in a sprint shows the people under it",
    who($('#board .lane.sprint .ocard[data-id="1"]')) === "~MK",
  );

  // the person menu: Sprint 3 now holds outcome 1 (MK is on deliverable 5, under it) and
  // deliverable 6 (nobody's)
  const inSprint = (sel) => !!$(`#board .lane.sprint ${sel}`),
    before = inSprint('.del[data-id="6"]');
  showFor("MK");
  await settle();
  check(
    "the person menu works here too",
    before && inSprint('.ocard[data-id="1"]') && !inSprint('.del[data-id="6"]'),
  );

  // outcomes act like other items here: in the pool, and cards that open
  showFor("Anyone");
  $("#board .lane.unlinked.closed .lane-head").click(); // open the pool again
  await settle();
  const inPool = () => $('#board .lane.unlinked .ocard[data-id="1"]');
  check(
    "the pool starts with the outcomes",
    $("#board .lane.unlinked .lane-body").firstElementChild === inPool(),
  );
  dragTo(
    inPool(),
    $('#board .lane-head[data-type="SP"][data-id="2"]').nextElementSibling,
  );
  await settle();
  check(
    "an outcome can be dragged from the pool into a sprint",
    S.SP.get(2).items.includes(1),
  );
  const card = () => $('#board .ocard[data-id="1"][data-parent="2"]');
  card().querySelector("[data-toggle]").click();
  await settle();
  check(
    "its arrow opens it to its capability cards",
    !!card().querySelector('.cap[data-id="2"]') &&
      !!card().querySelector('.cap[data-id="3"]'),
  );
  await poolSearch("build a survey");
  check(
    "the pool's search opens an outcome card to just what matches under it",
    !!inPool()?.querySelector('.cap[data-id="2"]') &&
      !inPool().querySelector('.cap[data-id="3"]'),
  );
  check(
    "... and typing in it keeps the focus in it",
    document.activeElement === $("[data-poolq]") &&
      $("[data-poolq]").value === "build a survey",
  );
  await poolSearch("");
  $("[data-poolq]").blur();
  const search = $("#search");
  search.value = "build a survey";
  search.dispatchEvent(new Event("input"));
  await settle();
  check(
    "the toolbar's search filters the sprints, not the pool",
    !!card().querySelector('.cap[data-id="2"]') &&
      !card().querySelector('.cap[data-id="3"]') &&
      !!inPool() &&
      !inPool().querySelector(".cap"),
  );
  search.value = "";
  search.dispatchEvent(new Event("input"));
  await settle();

  $("#collapseAll").click();
  $("#expandAll").click();
  await settle();
  check(
    "Expand all opens outcome cards, and what's in them",
    !!card()?.querySelector(
      '.cap[data-id="3"] .del[data-id="6"] .trow[data-id="10"]',
    ),
  );

  // Cards link the way they do on the outcome board. Sprint 2 holds capability 2 and outcome 1;
  // Sprint 3, deliverable 6 and outcome 1. Deliverable 7 is in no sprint and under nothing.
  const inLane = (sid, sel) =>
      // the first note matching sel in sprint sid's list
      $(
        `#board .lane-head[data-type="SP"][data-id="${sid}"]`,
      ).parentElement.querySelector(sel),
    // open a card with its arrow
    expand = async (el) => {
      el.querySelector("[data-toggle]").click();
      await settle();
    };
  $("#collapseAll").click(); // (so the pool fits on the page)
  await settle();
  dragTo(
    $('#board .lane.unlinked .del[data-id="7"]'),
    inLane(2, '.cap[data-id="2"]'),
  );
  await settle();
  check(
    "dropping a note onto a card in a sprint links it there (so it's in the sprint through the card)",
    S.C.get(2).kids.D.includes(7) &&
      S.D.get(7).via.has(2) &&
      !S.SP.get(2).items.includes(7),
  );
  await expand($('#board .lane.unlinked .ocard[data-id="1"]'));
  await expand($('#board .lane.unlinked .cap[data-id="2"]'));
  dragTo(
    $('#board .lane.unlinked .cap[data-id="2"] .del[data-id="7"]'),
    inLane(3, ".lane-head"),
  );
  await settle();
  check(
    "dragged out of a card into a sprint, it's added to the sprint and keeps its link",
    S.SP.get(3).items.includes(7) && S.C.get(2).kids.D.includes(7),
  );
  await expand(inLane(2, '.cap[data-id="2"]'));
  inLane(2, '.cap[data-id="2"] .del[data-id="7"] > .x').click();
  await settle();
  check(
    "x on a note in a card unlinks it from the card, as on the outcome board",
    !S.C.get(2).kids.D.includes(7) && S.SP.get(3).items.includes(7),
  );
  dragTo(inLane(3, '.del[data-id="6"]'), inLane(3, '.ocard[data-id="1"]'));
  await settle();
  check(
    "dragged from the top of a sprint onto a card in it, it's linked there and leaves the top",
    S.O.get(1).kids.D.includes(6) &&
      S.C.get(3).kids.D.includes(6) &&
      !S.SP.get(3).items.includes(6) &&
      S.D.get(6).via.has(3),
  );
  await expand(inLane(3, '.ocard[data-id="1"]'));
  dragTo(
    inLane(3, '.ocard[data-id="1"] .del[data-id="6"][data-parent="1"]'),
    $("#board .lane.unlinked .lane-head"),
  );
  await settle();
  check(
    "dragged from a card to the pool, it's unlinked from that card",
    !S.O.get(1).kids.D.includes(6) && S.C.get(3).kids.D.includes(6),
  );

  // copy deliverable 7 (at the top of Sprint 3), then paste it onto capability 2 in Sprint 2, then
  // onto Sprint 2
  inLane(3, '.del[data-id="7"]').click();
  await settle();
  pressCtrl("c");
  inLane(2, ':scope > .lane-body > .cap[data-id="2"]').click();
  await settle();
  pressCtrl("v");
  await settle();
  check(
    "pasting onto a card in a sprint links it there, and takes it out of nothing",
    S.C.get(2).kids.D.includes(7) && S.SP.get(3).items.includes(7),
  );
  inLane(2, ".lane-head").click();
  await settle();
  pressCtrl("v");
  await settle();
  check(
    "pasting with a sprint selected adds it to the sprint",
    S.SP.get(2).items.includes(7),
  );

  // The pool. Outcome 1 holds capabilities 2 and 3, which hold deliverables 5, 6, and 7 and their
  // tasks; capability 4 is under nothing. (The Status menu has Done unticked, so task 8 is hidden,
  // and the shelved statuses ticked, so dropped capability 4 and tabled task 11 show.)
  check(
    "nested, the pool's top has only what's under nothing",
    poolTop() === "O1,C4",
  );
  showFor("DR");
  await settle();
  check("... and the person menu doesn't filter it", poolTop() === "O1,C4");
  showFor("Anyone");
  await poolChip("flat");
  check(
    "flat, it has every item once: outcomes, capabilities, deliverables, then tasks",
    poolTop() === "O1,C2,C3,C4,D5,D6,D7,T9,T10,T11",
  );
  check(
    "... each on its own, with no arrow to open it",
    !$("#board .lane.unlinked .lane-body [data-type] [data-type]") &&
      !$("#board .lane.unlinked [data-toggle]"),
  );
  const typeButton = () => $('[data-menu="type"]').textContent,
    typeList = () => $('.check-menu[data-key="type"] .menu-list');
  await poolType("all");
  check(
    "unticking (Select all) in the Type menu shows nothing",
    poolTop() === "" && typeButton().includes("None"),
  );
  await poolType("D");
  check("ticking a level shows just that level", poolTop() === "D5,D6,D7");
  await poolType("T");
  check(
    "... two, both, and the button says which",
    poolTop() === "D5,D6,D7,T9,T10,T11" &&
      typeButton().includes("Deliverable, Task"),
  );
  inLane(3, ".lane-head").click();
  await settle();
  check(
    "a click elsewhere closes the Type menu, and still does what it clicked",
    !typeList() && ui.pane?.type === "SP" && ui.pane.id === 3,
  );
  await poolType("all");
  check(
    "ticking (Select all) shows every level again",
    poolTop() === "O1,C2,C3,C4,D5,D6,D7,T9,T10,T11" &&
      typeButton().includes("All"),
  );
  $('[data-menu="type"]').dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  check(
    "Esc closes the Type menu (and leaves the side pane open)",
    !typeList() && !menus.type.open && ui.pane?.id === 3,
  );
  await poolSearch("survey");
  check(
    "flat, the pool's search shows just the items that match",
    poolTop() === "O1,C2,D5",
  );
  await poolSearch("");
  $("[data-poolq]").blur();
  $("[data-hideplanned]").click();
  await settle();
  check(
    "Hide planned leaves out what's in a planned or active sprint, directly or through a parent",
    poolTop() === "C4",
  );
  $("[data-hideplanned]").click();
  await poolChip("nested");
  check("Nested goes back", poolTop() === "O1,C4");

  // Archive done. Deliverables 6 and 7 are done too now; 6 has task 10 under it, not done. Sprint 3
  // holds outcome 1, so everything under it.
  await act([
    ["BulkUpdateRecord", "Items", [6, 7], { Status: ["Done", "Done"] }],
  ]);
  const archiveLabel = () => $("#archiveDone").textContent,
    archived = (id) => S.all.get(id).row.Status === "Archived",
    answer = async (go) => {
      $(`#archiveConfirm [data-archive="${go}"]`).click();
      await settle();
    };
  inLane(3, ".lane-head").click();
  await settle();
  check(
    "with a sprint selected, Archive done counts the done items in it, leaving out one with unfinished work under it (7 and task 8, not 6)",
    archiveLabel() === "Archive 2 done in “Sprint 3”",
  );
  $("#archiveDone").click();
  check(
    "... it asks first",
    !$("#archiveConfirm").hidden &&
      $("#archiveConfirm").textContent.includes(
        "Archive 2 done items in “Sprint 3”?",
      ),
  );
  await answer("go");
  check(
    "... and archives them",
    archived(7) && archived(8) && !archived(6) && $("#archiveConfirm").hidden,
  );
  await act([["UpdateRecord", "Items", 10, { Status: "Done" }]]);
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await settle();
  check(
    "with nothing selected, it counts every done item (6, now that task 10 is done, and 10)",
    archiveLabel() === "Archive all 2 done",
  );
  $("#archiveDone").click();
  await answer("cancel");
  check(
    "Cancel archives nothing",
    !archived(6) && !archived(10) && !$("#archiveDone").hidden,
  );
  inLane(3, '.ocard[data-id="1"]').click();
  await settle();
  check(
    "with an item selected, it counts the item and what's under it",
    archiveLabel() ===
      "Archive 2 done under “Sample client runs a survey in the portal”",
  );
  $("#archiveDone").click();
  await answer("go");
  check(
    "... archives them, and then has nothing left to do",
    archived(6) && archived(10) && $("#archiveDone").disabled,
  );
}

// show the results at the top of the page (and in the console)
function show() {
  const out = document.createElement("pre");
  out.id = "test-results";
  out.textContent = results.join("\n");
  out.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:20;margin:0;padding:8px 12px;font:13px monospace;" +
    `background:${results.some((x) => x.startsWith("FAIL")) ? "#f8d0d0" : "#d0f0d8"}`;
  document.body.append(out);
  console.log(results.join("\n"));
}

run()
  .catch((e) =>
    check(`the tests ran to the end (stopped: ${e.message})`, false),
  )
  .finally(show);
