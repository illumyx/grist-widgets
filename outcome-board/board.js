/* Outcome Board page: the pool, then one list per outcome. */

import { start, CFG, esc, S, ui, kidsOf, poolName, page, $ } from "./core.js";
import { addHTML, capHTML, afterRender, num, paneIs, pills } from "./view.js";

function laneHTML(o) {
  const id = o ? o.id : 0;
  let caps = kidsOf("C", id).map((c) => S.C.get(c));
  if (!o) {
    // the pool: capabilities + a stand-in card holding the pool's deliverables
    const orphanD = kidsOf("D", 0);
    caps.push({
      id: 0,
      name: poolName("D"),
      kids: orphanD,
      parents: [],
      row: {},
    });
  }
  const imp = o && num(o.row[CFG.O.impact]);
  const open = o && paneIs("O", o.id);
  return `<section class="lane${o ? "" : " unlinked"}">
    <div class="lane-head${open ? " open" : ""}" tabindex="0" data-type="O" data-id="${id}" data-parent="0"${o ? ' draggable="true" title="Drag to reorder"' : ""}>${o ? esc(o.name) : "Pool"}
      <span class="sub">${o ? `${o.kids.length} capabilit${o.kids.length === 1 ? "y" : "ies"}${imp !== null && imp !== undefined ? ` · impact ${imp}` : ""}` : `Drag notes here to unlink them <label class="toggle"><input type="checkbox" data-hidelinked${ui.showAll ? "" : " checked"}> Hide linked</label>`}</span>${o ? pills(o) : ""}</div>
    <div class="lane-body" data-drop="C" data-parent="${id}">${caps.map((c) => capHTML(c, id)).join("")}
      ${addHTML("C", id)}</div></section>`;
}

page.render = () => {
  const board = $("#board"),
    scroll = [...board.querySelectorAll(".lane-body")].map((e) => e.scrollTop),
    left = board.scrollLeft;
  board.innerHTML =
    laneHTML(null) + [...S.O.values()].map(laneHTML).join("") + addHTML("O", 0);
  board
    .querySelectorAll(".lane-body")
    .forEach((e, i) => (e.scrollTop = scroll[i] || 0));
  board.scrollLeft = left;
  afterRender();
};

start();
