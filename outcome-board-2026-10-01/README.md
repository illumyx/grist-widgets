# Link board (Grist custom widget)

Outcomes are lists, capabilities are sticky notes, deliverables are small notes on them,
and clicking a deliverable opens its task checklist. Every link is many-to-many.

- Drag a note to move it (between lists, between capability cards, or a task onto a deliverable).
  Dragging near the edge of the board or a list scrolls it.
- To link a note in a second place: click it, Ctrl/Cmd+C, click the destination (a list header,
  a capability, or open a deliverable), Ctrl/Cmd+V.
- × on a note (or the Delete key) removes that one link; the record itself stays.
- To delete a record, use Delete at the bottom of its side pane (or the trash icon on a task). You can
  also delete what's linked only under it; anything also linked elsewhere is kept.
- The Pool (first list) holds unlinked capabilities, deliverables, and tasks; untick "Hide linked" to see all of them.
  Dragging from the pool adds a link; dragging into it unlinks. Pool items can be dragged into any order
  (saved as the table's row order).
- Keys: arrows move between notes (up/down within a list or the task list, left/right across lists);
  Space expands a capability or opens/closes a deliverable's side pane; Enter opens the side pane.
- ×N means the note appears in N places; hovering outlines the other copies.
- Capabilities have a status (Not Started / In Progress / Available); "Hide done" also hides Available ones.
- Click an outcome header, capability, or deliverable to open its details in the side pane: status, urgency,
  and impact/effort estimates. "~8" means the number is an estimate; plain "8" is rolled up from linked items.
- Edit a name at the top of the side pane (Enter saves, Esc cancels); double-click a task to rename it.
- Tasks: tick to mark done, click the small square to cycle urgency (normal / yellow / red), type an effort.
- Yellow/red banners show Elevated/High urgency; a capability shows the highest urgency among its open deliverables.
- The filter matches capability, deliverable, and task names; matching tasks are highlighted in the side pane.

Column names are in `CFG` and `FIELDS` at the top of `app.js`. Expects the columns added by `bin/extend_schema.py`.

## Try it locally

    cd outcome-board && python -m http.server 8000

Open http://localhost:8000 for a demo with sample data (changes stay in the browser).
To run it against the real doc, use http://localhost:8000/index.html as the widget URL below.

## Add it in Grist

Add widget to page -> Custom -> enter the widget URL -> select data: Outcomes -> access: Full document.
