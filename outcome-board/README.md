# Link board (Grist custom widget)

Outcomes are lists, capabilities are cards, deliverables are small notes on them, and tasks are rows
in a deliverable (its arrow opens it; clicking it opens its side pane, with the task checklist). Every link is
many-to-many.
Card backgrounds ramp by level (outcome dark yellow, capability yellow, deliverable light yellow, task white) and
cards shrink in size and weight down the levels; what's under a capability is indented along a guide line. The bar
at a card's left is its status, white (not started) to dark blue (done).

- Levels can be skipped: an outcome list can also hold deliverables and tasks directly (after its
  capability cards), and a capability its own tasks (after its deliverables). Those tasks are small rows;
  the parent's side pane lists them like a deliverable's checklist (with an "Add a task" box). A child is always at a lower level than its parent; the board won't drop or paste
  it anywhere else.
- Drag a note to move it: between lists, between capability cards, or onto any card, note, or list that
  can hold it (dropped anywhere in an outcome list, a deliverable or task goes directly under the outcome).
  Dragging near the edge of the board or a list scrolls it.
- To link a note in a second place: click it, Ctrl/Cmd+C, click the destination (a list header,
  a capability, or open a deliverable), Ctrl/Cmd+V.
- × on a note (or the Delete key) removes that one link; the record itself stays.
- To delete a record, use Delete at the bottom of its side pane (or the trash icon on a task). You can
  also delete what's linked only under it; anything also linked elsewhere is kept.
- The Pool (first list) holds capabilities, then deliverables, then tasks. Nested (to start) shows the ones under
  nothing, laid out like an outcome list, so nothing shows twice; Flat shows every item once, on its own, without
  what's under it. Its header has its own search box (it finds what's under a card the way the toolbar's filter does)
  and a Type menu, like a spreadsheet's column filter: untick a level to leave it out ((Select all) ticks or unticks
  them all); a click elsewhere or Esc closes it. The toolbar's filter and person menu don't apply to the pool; Hide
  done and Hide shelved do. Lists stay the same width: long names wrap. Dragging from the pool adds a link; dragging into it
  unlinks. Pool items can be dragged into any order (saved as the table's row order).
- "+ Add item" (at the bottom of an outcome list, an expanded capability, the pool, or a sprint) adds a new item
  there: pick its type with the chips (or Alt+O/C/D/T; it remembers the last one), type a name, Enter. The box
  stays open for the next one; Esc closes it, and so does clicking away (adding what was typed).
- Clicking a task (a row on the page, or its name in a side pane's checklist; or Enter) opens its own side pane
  (type, status, shelved, urgency, effort, assigned, when it's due, sprints). The parent chips at the top of a side
  pane open the parent's.
- Keys: arrows move between notes (up/down within a list or the task list, left/right across lists);
  Space expands a capability or deliverable; Enter opens the side pane.
- "Expand all" opens every capability, deliverable, and (on the sprints page) outcome card; "Collapse all" closes them.
- ×N means the note appears in N places; hovering outlines the other copies.
- Every item has a status (Not Started / In Progress / Review / Done; blank counts as Not Started), shown by the colored
  bar at the left of its card, note, row, or outcome header: white (not started), light blue, blue, dark blue (done).
  A done capability shows as "Available", and "Hide done" hides done items (and done outcome lists).
- Any item can be shelved with the side pane's Shelved menu: Tabled (not now, maybe later) or Archived (dropped).
  "Hide shelved" (ticked to start, on both pages) hides shelved items and what's drawn under them; unticked, they show
  faded, with a Tabled or Archived tag. A shelved item isn't counted in its deliverable's tasks, its capability's
  urgency, a sprint's progress, or (in Grist) its parents' roll-ups; it isn't shown as late; and it doesn't bring
  what's under it into its sprints.
- Click an outcome header, capability, or deliverable to open its details in the side pane: type, status, urgency,
  impact/effort estimates, and when it's due. "~8" means the number is an estimate; plain "8" is rolled up from linked items.
- The side pane's Type changes an item's level (e.g. a deliverable into a task). Levels its children can't sit under
  are greyed out: it must stay above all of them. A level one of its parents can't hold is marked "(moves up)":
  choosing it moves the item up past that parent, to the nearest item above that can hold it (e.g. a task in a
  deliverable, made a deliverable, goes onto that deliverable's capability; with nothing above, an outcome becomes a
  list of its own and anything else goes to the pool). The link to the parent it passed, and its "optional" mark, go.
- Each parent chip in the side pane has an "optional" box: ticked, that link is optional (the item gets
  none of that parent's impact and isn't counted in its effort; see `doc/impact-allocation.md` in the
  grist repo), and the item shows "optional" where it's drawn under that parent. Unlinking clears it.
- Assign an item to people with the side pane's Assigned boxes, or a task with its "Assign..." menu in the checklist
  (pick a name again to unassign). Their initials show on the card, note, or row. The people are the choices of the
  Items.Assignees column in Grist: add a choice there to add a person.
- Assignment says who will act, so it rolls up: after its own initials, a card, note, or outcome header shows (faded)
  the initials of the others on anything shown under it. "Hide done" and "Hide shelved" decide what's shown.
- Edit a name at the top of the side pane (Enter saves, Esc cancels).
- Tasks: tick to mark done, click the small box to cycle urgency (normal / ! / !!), type an effort.
  A blank effort reads as 0 in Grist, so 0 means "not estimated".
- A red chip with ! (Elevated) or !! (High) before a name shows urgency; a capability
  shows the highest urgency among its open deliverables and tasks.
- The filter matches capability, deliverable, and task names; matching tasks are highlighted in the side pane.
- The person menu next to it shows what someone is on: the items assigned to them, and the lists, cards, and notes
  they sit in (a card shown only for what's under it opens to show it). "Unassigned" shows the items nobody is on or
  under, and what they sit in. Both filters apply together (not to the pool, which has its own search box); in the
  side pane, matching tasks are highlighted.
- The pool stays in place while the other lists scroll sideways. Its ‹ button collapses it to a slim strip (on both
  pages); click the strip to open it again. Notes dropped on the strip land in the pool, as usual.
- When it's due (side pane): "Due by" a date, "Due from" the earliest it could be due (a range with both; on
  its own, open-ended), and a "Timing note" for timing that isn't a date ("Ongoing", "By cohort 3"). Outcome headers,
  cards, and notes show it in bold under the title (task rows: in bold after the name), e.g. "Due Nov 10", "Due Oct 2026", "Due Dec 2026 - Jan 2027", "Due Mar 2027 or
  later" (whole months show as months), plus the note; red once the due-by day has passed and it isn't done.
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
Add `?test` (index.html?test, sprints.html?test) to run the tests in `test.js` against the sample data.

## Sprints page (`sprints.html`)

The pool, then one list per sprint: Planned and Active (tick "Show completed" for the rest), in start-date order
until you drag a sprint's header to reorder. Each list holds what was added to that sprint (outcomes, capabilities,
deliverables, and tasks as small rows), laid out like the pool; whatever is under an item comes with it.
The header shows its dates (in bold under the name), status, and a progress bar: the leaves in the sprint (on their
own or through a parent: items with nothing under them, or nothing but shelved items; shelved ones left out), stacked
by status in the status colors (done at the left, so it fills up as items are done), then the share that's done; hover
for the counts. Items are counted, not weighted by effort, since few have an effort. Click it to edit the sprint
(name, status, dates, notes) or delete it (its items are kept). "+ Add sprint" adds one.

- The pool starts with the outcomes (as cards, so nested, what's under an outcome is inside its card); its Type menu
  has Outcome here too. "Hide planned" leaves out items already in a planned or active sprint.
- Outcomes are cards here. Their arrow (or Space) opens one to show what its list on the outcome board holds: its
  capability cards, then the deliverables and tasks linked to it directly. A filter opens it to what matches under it.
- "Hide done" starts ticked here, and notes don't show sprint pills (the list they're in says which sprint).
- Drag from the pool into a sprint (its open space or its header) to add an item; from one sprint to another to move
  it; back to the pool to take it out. Tasks can be dragged from the side pane. Within a sprint, drag an item up or
  down to reorder it among the others of its kind (outcomes, capabilities, deliverables, tasks stay in that order).
  Dragging something out of a card into a sprint adds it to the sprint and keeps its link to the card.
- Cards link the way they do on the outcome board, in the pool and in sprints: drop an item onto a card that can hold
  it to link it there (moving it from the card it came from, if any), and drag it from a card to the pool to unlink it.
  Its sprints don't change, except that an item dragged from the top of a sprint onto a card in that same sprint
  leaves the top (it's in the sprint through the card).
- x (or Delete) on an item at the top of a sprint takes it out of the sprint; on an item in a card, unlinks it from
  that card.
- Ctrl/Cmd+C an item, then select a card that can hold it and Ctrl/Cmd+V to link it there (as on the outcome board),
  or select a sprint (or anything at its top) and Ctrl/Cmd+V to add it to the sprint.
- "+ Add item" at the bottom of a sprint adds a new item (with no parent) to it.

## Add it in Grist

Add widget to page -> Custom -> enter the widget URL -> select data: Items -> access: Full document.
For the sprints page, add another Custom widget with `.../sprints.html` as the URL and Sprints as its data.
