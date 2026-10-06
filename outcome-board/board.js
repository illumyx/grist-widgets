/* Outcome Board page: the pool, then one list per outcome. */

import { start, CFG, esc, S, page, plural } from "./core.js";
import {
  addHTML,
  addItemHTML,
  capHTML,
  directDelsHTML,
  directTasksHTML,
  drawBoard,
  num,
  paneIs,
  pills,
  poolHTML,
  visible,
  whoHTML,
} from "./view.js";

// An outcome list: its capability cards, then deliverables and tasks linked to it directly.
function laneHTML(o) {
  const imp = num(o.row[CFG.I.impact]),
    counts = ["C", "D", "T"]
      .filter((k) => k === "C" || o.kids[k].length)
      .map((k) => plural(o.kids[k].length, k))
      .join(" · ");
  return `<section class="lane">
    <div class="lane-head${paneIs("O", o.id) ? " open" : ""}" tabindex="0" data-type="O" data-id="${o.id}" data-parent="0" draggable="true" title="Drag to reorder">${esc(o.name)}
      <span class="sub">${counts}${imp !== null && imp !== undefined ? ` · impact ${imp}` : ""}</span>${whoHTML(o)}${pills(o)}</div>
    <div class="lane-body" data-drop="C" data-parent="${o.id}">${o.kids.C.map((c) => capHTML(S.C.get(c), o.id)).join("")}
      ${directDelsHTML(o, "Remove from this outcome")}${directTasksHTML(o, "Remove from this outcome")}
      ${addItemHTML(`O${o.id}`, ["C", "D", "T"], o.id)}</div></section>`;
}

page.render = () =>
  drawBoard(
    poolHTML("Drag notes here to unlink them") +
      [...S.O.values()].filter(visible).map(laneHTML).join("") +
      addHTML("O", 0),
  );

start();
