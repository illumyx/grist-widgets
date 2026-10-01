/* Stand-in for Grist when index.html is opened directly (not inside Grist), so the board can be tried locally.
 * Uses window.LINKBOARD_DATA if present, otherwise a tiny sample. Changes live in memory only. */
(function () {
  if (window.top !== window) return; // inside Grist: use the real API
  // two-way links: [parent table, its list column, child table, child's back-reference column]
  const ALL_PAIRS = [
    ["Outcomes", "Capabilities", "Capabilities", "Outcomes"],
    ["Capabilities", "Deliverables", "Deliverables", "Capabilities"],
    ["Deliverables", "Tasks", "Tasks", "Deliverables"],
    ...["Outcomes", "Capabilities", "Deliverables", "Tasks"].map((t) => [
      "Sprints",
      t,
      t,
      "Sprints",
    ]),
  ];
  const db = window.LINKBOARD_DATA || {
    Outcomes: [
      {
        id: 1,
        Outcome: "Sample client runs a survey in the portal",
        Capabilities: [1, 2],
      },
    ],
    Capabilities: [
      {
        id: 1,
        Capability: "A consultant can build a survey",
        Deliverables: [1],
      },
      {
        id: 2,
        Capability: "A consultant can email respondents",
        Deliverables: [1, 2],
      },
      {
        id: 3,
        Capability: "The team is alerted to production errors",
        Deliverables: [],
      },
    ],
    Deliverables: [
      {
        id: 1,
        Deliverable: "Survey preview page",
        Status: "In Progress",
        Tasks: [1, 2],
      },
      {
        id: 2,
        Deliverable: "Reminder email template",
        Status: "Not Started",
        Tasks: [3],
      },
      {
        id: 3,
        Deliverable: "Error alerts to Slack",
        Status: "Not Started",
        Tasks: [],
      },
    ],
    Tasks: [
      { id: 1, Task: "Wireframe", Status: "Done" },
      { id: 2, Task: "Build page", Status: "Not Started" },
      { id: 3, Task: "Draft copy", Status: "Not Started" },
    ],
    // Start/End are Grist dates: seconds since 1970 (UTC midnight)
    Sprints: [
      {
        id: 1,
        Sprint: "Sprint 1",
        Start: 1789948800,
        End: 1791158400,
        Status: "Completed",
        Deliverables: [3],
      },
      {
        id: 2,
        Sprint: "Sprint 2",
        Start: 1791158400,
        End: 1792368000,
        Status: "Active",
        Capabilities: [1],
        Tasks: [3],
      },
      {
        id: 3,
        Sprint: "Sprint 3",
        Start: 1792368000,
        End: 1793577600,
        Status: "Planned",
        Deliverables: [2],
      },
    ],
  };
  const PAIRS = ALL_PAIRS.filter(([pt]) => db[pt]); // custom data may have no Sprints table
  const sync = () =>
    PAIRS.forEach(([pt, pc, ct, cc]) => {
      db[ct].forEach((r) => (r[cc] = []));
      db[pt].forEach((p) =>
        (p[pc] || []).forEach((id) =>
          db[ct].find((r) => r.id === id)?.[cc].push(p.id),
        ),
      );
    });
  Object.values(db).forEach((rows) =>
    rows.forEach((r) => (r.manualSort ??= r.id)),
  );
  sync();
  const enc = (v) => (Array.isArray(v) ? ["L", ...v] : v);
  const dec = (v) => (Array.isArray(v) && v[0] === "L" ? v.slice(1) : v);
  window.GRIST_MOCK = {
    ready() {},
    onRecords() {},
    docApi: {
      async fetchTable(t) {
        const rows = db[t],
          cols = new Set(rows.flatMap(Object.keys)),
          out = {};
        cols.forEach((c) => (out[c] = rows.map((r) => enc(r[c] ?? null))));
        if (!out.id) out.id = [];
        return out;
      },
      async applyUserActions(actions) {
        for (const [op, t, id, f] of actions) {
          if (op === "BulkUpdateRecord")
            id.forEach((rid, i) =>
              Object.entries(f).forEach(
                ([k, v]) => (db[t].find((r) => r.id === rid)[k] = v[i]),
              ),
            );
          else if (op === "UpdateRecord")
            Object.entries(f).forEach(
              ([k, v]) => (db[t].find((r) => r.id === id)[k] = dec(v)),
            );
          else if (op === "AddRecord") {
            const nid = Math.max(0, ...db[t].map((r) => r.id)) + 1,
              row = { id: nid };
            Object.entries(f).forEach(([k, v]) => (row[k] = dec(v)));
            row.manualSort = nid;
            db[t].push(row);
            PAIRS.filter((p) => p[2] === t && row[p[3]]).forEach(
              ([pt, pc, , cc]) =>
                row[cc].forEach((pid) =>
                  (db[pt].find((r) => r.id === pid)[pc] ??= []).push(nid),
                ),
            );
          } else if (op === "BulkRemoveRecord") {
            // like Grist: drop the rows and any references to them
            db[t] = db[t].filter((r) => !id.includes(r.id));
            PAIRS.filter((p) => p[2] === t).forEach(([pt, pc]) =>
              db[pt].forEach(
                (r) => (r[pc] = (r[pc] || []).filter((x) => !id.includes(x))),
              ),
            );
          } else throw new Error("mock: unsupported action " + op);
        }
        sync();
      },
    },
  };
})();
