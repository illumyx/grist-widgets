/* In-browser tests for dragging notes (view.js), run against the demo data in mock.js. Nothing to
 * install: serve the folder (cd outcome-board && python -m http.server 8000) and open
 * http://localhost:8000/index.html?test -- the results show at the top of the page. The tests change
 * the demo data, so reload to run them again. */

import { S, ui } from "./core.js";

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

const results = [];
function check(name, ok) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

async function run() {
  while (!$("#board .del")) await settle(); // the board has loaded
  $("#expandAll").click();
  await settle();
  // demo data: capability 2 holds deliverable 5; capability 3 holds 5 and 6 (which has task 10)

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
