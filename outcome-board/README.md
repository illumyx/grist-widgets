# Link board (Grist custom widget)

Outcomes are lists, capabilities are sticky notes, deliverables are small notes on them,
and clicking a deliverable opens its task checklist. Every link is many-to-many.

- Levels can be skipped: an outcome list can also hold deliverables and tasks directly (after its
  capability cards), and a capability its own tasks (after its deliverables). Those tasks are small rows;
  clicking one opens its parent's side pane, which lists them like a deliverable's checklist (with an
  "Add a task" box). A child is always at a lower level than its parent; the board won't drop or paste
  it anywhere else.
- Drag a note to move it: between lists, between capability cards, or onto any card, note, or list that
  can hold it (dropped anywhere in an outcome list, a deliverable or task goes directly under the outcome).
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
- Capabilities have a status (Not Started / In Progress / Review / Done); a done one shows as "Available", and "Hide done" hides it (and done outcome lists).
- Click an outcome header, capability, or deliverable to open its details in the side pane: type, status, urgency,
  an outcome's target date, and impact/effort estimates. "~8" means the number is an estimate; plain "8" is rolled up from linked items.
- The side pane's Type changes an item's level (e.g. a deliverable into a task). Levels it can't take are
  greyed out: it must stay below all of its parents and above all of its children.
- Each parent chip in the side pane has an "optional" box: ticked, that link is optional (the item gets
  none of that parent's impact and isn't counted in its effort; see `doc/impact-allocation.md` in the
  grist repo), and the item shows "optional" where it's drawn under that parent. Unlinking clears it.
- Edit a name at the top of the side pane (Enter saves, Esc cancels); double-click a task to rename it.
- Tasks: tick to mark done, click the small square to cycle urgency (normal / yellow / red), type an effort.
  A blank effort reads as 0 in Grist, so 0 means "not estimated" (e.g. the sprint progress bars then count items).
- Yellow/red banners show Elevated/High urgency; a capability shows the highest urgency among its open deliverables.
- The filter matches capability, deliverable, and task names; matching tasks are highlighted in the side pane.
- The pool stays in place while the other lists scroll sideways; "Hide pool" hides it (on both pages).
- Sprints (once `bin/extend_schema.py` has added the Sprints table): colored pills show an item's sprints;
  an outlined pill means it's inherited from a parent (everything under an item in a sprint is in it too).
  The side pane's Sprints row adds the item to a sprint (or a new one) and x takes it out; each task row in
  the side pane has the same menu and pills.

Outcomes, capabilities, deliverables, and tasks are all rows of the Items table (its Type column says which).
Column names are in `CFG` and `FIELDS` at the top of `core.js`. Expects the tables and columns added by `bin/extend_schema.py`.

## Try it locally

    cd outcome-board && python -m http.server 8000

Open http://localhost:8000 for a demo with sample data (changes stay in the browser).
To run it against the real doc, use http://localhost:8000/index.html as the widget URL below.

## Sprints page (`sprints.html`)

The pool, then one list per sprint: Planned and Active (tick "Show completed" for the rest), in start-date order
until you drag a sprint's header to reorder. Each list holds what was added to that sprint (outcomes, capabilities,
deliverables, and tasks as small rows), laid out like the pool; whatever is under an item comes with it.
The header shows status, dates, and a progress bar (share of effort done among items with nothing under them, or of the items if any has no effort; hover for the numbers). Click it to edit the sprint
(name, status, dates, notes) or delete it (its items are kept). "+ Add sprint" adds one.

- The pool starts with every item; "Hide planned" leaves out items already in a planned or active sprint.
- Drag from the pool into a sprint to add an item; from one sprint to another to move it; back to the pool to
  take it out. Tasks can be dragged from the side pane. Within a sprint, drag an item up or down to reorder it
  among the others of its kind (outcomes, capabilities, deliverables, tasks stay in that order).
- x (or Delete) on an item in a sprint takes it out. Items that are only there through a parent have no x.
- Ctrl/Cmd+C an item, select a sprint, Ctrl/Cmd+V adds it.

## Add it in Grist

Add widget to page -> Custom -> enter the widget URL -> select data: Items -> access: Full document.
For the sprints page, add another Custom widget with `.../sprints.html` as the URL and Sprints as its data.
