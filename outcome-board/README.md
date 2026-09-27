# Link board (Grist custom widget)

Outcomes are lists, capabilities are sticky notes, deliverables are small notes on them,
and clicking a deliverable opens its task checklist. Every link is many-to-many.

- Drag a note to move it (between lists, between capability cards, or a task onto a deliverable).
- To link a note in a second place: click it, Ctrl/Cmd+C, click the destination (a list header,
  a capability, or open a deliverable), Ctrl/Cmd+V.
- × on a note (or Delete) removes that one link. Nothing is ever deleted from the tables.
- "Not linked to an outcome" holds unlinked capabilities and a bucket of deliverables without a capability.
- ×N means the note appears in N places; hovering outlines the other copies.
- Click an outcome header, capability, or deliverable to open its details in the side pane: status, urgency,
  and impact/effort estimates. "~8" means the number is an estimate; plain "8" is rolled up from linked items.
- Tasks: tick to mark done, click the small square to cycle urgency (normal / yellow / red), type an effort.
- Yellow/red banners show Elevated/High urgency; a capability shows the highest urgency among its open deliverables.

Column names are in `CFG` and `FIELDS` at the top of `app.js`. Expects the columns added by `bin/extend_schema.py`.

## Try it locally

    cd widgets/linkboard && python -m http.server 8000

Open http://localhost:8000 for a demo with sample data (changes stay in the browser).
To run it against the real doc, use http://localhost:8000/index.html as the widget URL below.

## Add it in Grist

Add widget to page → Custom → enter the widget URL → select data: Outcomes → access: Full document.
