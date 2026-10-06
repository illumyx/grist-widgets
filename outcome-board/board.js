/* Outcome Board page: the pool, then one list per outcome. */

import { start, CFG, esc, S, page } from "./core.js";
import {
  addHTML,
  capHTML,
  drawBoard,
  num,
  paneIs,
  pills,
  poolHTML,
} from "./view.js";

function laneHTML(o) {
  const imp = num(o.row[CFG.I.impact]);
  return `<section class="lane">
    <div class="lane-head${paneIs("O", o.id) ? " open" : ""}" tabindex="0" data-type="O" data-id="${o.id}" data-parent="0" draggable="true" title="Drag to reorder">${esc(o.name)}
      <span class="sub">${o.kids.length} capabilit${o.kids.length === 1 ? "y" : "ies"}${imp !== null && imp !== undefined ? ` · impact ${imp}` : ""}</span>${pills(o)}</div>
    <div class="lane-body" data-drop="C" data-parent="${o.id}">${o.kids.map((c) => capHTML(S.C.get(c), o.id)).join("")}
      ${addHTML("C", o.id)}</div></section>`;
}

page.render = () =>
  drawBoard(
    poolHTML("Drag notes here to unlink them") +
      [...S.O.values()].map(laneHTML).join("") +
      addHTML("O", 0),
  );

start();
