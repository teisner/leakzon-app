# LeakZon — Version History

Versions that belong to the same piece of work are grouped into one entry, so a
run of small steps toward the same thing reads as a single change. Newest first.

Each entry is tagged with what it contains:

- **Bug fix** — something was broken and now works
- **New feature** — something that wasn't there before
- **Updated feature** — an existing feature changed, improved or removed
- Combinations are listed together, e.g. *New feature + Bug fix*

An entry marked **Important** changes the way you work — how data goes in or
comes out, what a screen lets you do, or a fault that was costing you time.
Entries without it are cosmetic, internal, or fun.

The running version is shown at the bottom of the side menu.

## 1.127, 1.129 — 2026-07-29 · *New feature + Bug fix* · **Important**
**A project with no boundary now asks you to draw one, as the first step**
- The boundary is looked up automatically from the city when a project is
  created. Where no official outline exists the project was simply left without
  one, silently — and every layer is clipped to the boundary, so that matters.
- Opening such a project now asks straight away, naming the city, and offers
  **Draw it on the map**, **Search again**, **Upload a boundary file**, or
  **Later**. It asks once per project, not on every visit, and never on a locked
  project.
- **Define the Project Boundary is now the first step of the onboarding wizard**,
  ahead of importing shapefiles. Clicking it takes you to the map in drawing
  mode. It counts as done as soon as the project has a boundary — including
  projects that already had one before this, or that were given one by import,
  so nothing shows as outstanding that isn't.
- An existing project without a boundary can still add one at any time from the
  Layers panel, which is unchanged.
- **Fixed a blank page when re-fetching the boundary**, introduced by the prompt
  above and caught before it ever reached the live site. The prompt's spinner
  used an icon that was never imported, and the reference is evaluated the
  moment a fetch starts — so pressing **Re-fetch** anywhere blanked the screen.
- The project check that exists to catch exactly this kind of mistake had a gap:
  it flagged an undefined *variable* but not an undefined *component*, which is
  the more common way it happens. It now catches both, and a scan of the whole
  codebase found no other case.

## 1.002, 1.062, 1.063, 1.065, 1.111 – 1.114, 1.125, 1.126 — 2026-07-29 · *New feature + Updated feature + Bug fix* · **Important**
**Export to LeakZon: analyse first, then export in the Main platform's own format**
- The export **starts with an analysis**. Before anything downloads you see the
  DMA count, meters assigned vs not, mains vs subs, which DMAs have no main
  meter, main meters linked to no DMA at all, and meters with no coordinates —
  then you choose whether to continue. The insights are shown again at the end,
  with a **Continue to LeakZon platform** button.
- It produces **three files** plus the shapefiles: **Meter Data**, **Groups**,
  and a separate file for meters with no DMA. Nothing is dropped — every meter
  appears in one file or the other.
- **Meter Data** carries the exact columns and order the Main platform expects,
  with constants filled in: Installation Date today, Unit following the project's
  water unit, multiplier 1, Isactive TRUE, ufr FALSE, meter type water, and
  Location as latitude and longitude in one field. Headers are always English,
  whatever language the app is set to.
- **Groups** lists each meter's identifier, whether it is a main, its DMA name,
  whether it is a root, type REGULAR, and its communication — AMI for every main,
  and the **Sub-meter communication** project setting for sub-meters.
- You **choose which fields make up the Identifier** and **which field is the
  Meter Number**, each option showing how many meters actually have a value, so a
  column can't be exported empty by accident. **Both files can be previewed**
  with the choices applied live.
- **A DMA with no main meter gets a placeholder main** — a numeric UID continuing
  past the highest in the project, account name `<DMA name>_Fic`, placed at the
  DMA's centre — so no DMA is exported without one.
- **A main counts for a DMA only when it is actually assigned to it.** Mains sit
  at inlets and boundaries and are often inside a DMA they do not feed, so where
  one happens to fall says nothing about what it serves. Expect lower "DMAs with
  a main" numbers and more placeholders than before — they reflect what is really
  assigned.
- **No duplicate meters:** a main serving several DMAs appears **once** in Meter
  Data. The Groups file still lists it once per DMA, which is what that file is
  for.
- Files are named after the project — `Obion TN_meter_data.xlsx`,
  `Obion TN_groups.xlsx`, `Obion TN_meters_no_dma.xlsx` — so several exports can
  share a folder.
- **Excel no longer warns that the file is corrupt.** Every spreadsheet was named
  **.xls** while holding a different format. They are now genuine **.xlsx**.
  Affects the LeakZon export, the meter table export and the DMA data export;
  re-export anything downloaded before this.
- **DMA.shp and the boundary layer export as outlines**, not filled areas — DMA
  outlines black, boundary red dashed — so they sit over a map without hiding it.
  Including the DMA shapefile is now **optional and off by default**, since
  LeakZon reads the areas from the Groups file; tick it when the boundaries are
  going into a different GIS platform.
- **Fixed:** the SHP/JSON export page reported "No DMAs with a valid polygon to
  export" for every project — it was reading the wrong column.
- **Fixed a misclassification:** a layer named "Sub Main Meters" contains the
  text "Main Meter", so its meters were exported as mains — in Woodlawn that was
  all 5,122 sub meters.
- **Fixed: the export failed outright on Woodlawn.** It stopped with *"Request
  failed (546)"* — the server cut the job off for taking too much processing
  time. Woodlawn is the largest project on the platform, and its export sat just
  over the ceiling: the analysis and preview steps went through fine, only the
  final packaging failed, which is why it looked like the export "sometimes"
  worked.
- Two things were being paid for on every export and are now not: the spreadsheet
  and zip libraries were being loaded during the request rather than when the
  server starts, and the finished zip was being text-encoded to travel back
  inside the response, which cost as much again as building it.
- **The export is now handed over as a download link** to the stored file
  instead of being sent back inline, and the shapefiles are compressed. Together
  that cut roughly half the work out of the request.
- Verified on all three Woodlawn projects: each now packages in about 10 seconds
  and produces the full set — Meter Data, Groups, meters without a DMA, and the
  shapefiles.
- **Fixed: every water line in the shapefile appeared to have the same
  diameter.** The attribute table's header declared a record length of zero, so
  GIS software reading it stepped nowhere between rows and showed the first
  line's values repeated for all 402. The diameters were in the file all along —
  the index to them was wrong. Woodlawn's lines now read correctly: 195 at 6",
  113 at 4", 44 at 8", 30 at 2", 6 at 12", 5 at 16", and so on, exactly matching
  the source.
- **Every attribute from the source file is now exported**, not just five.
  Water lines carry their feature id, material, location, installation and
  inspection dates, condition, notes and length; valves keep all 26 of their
  columns. Previously all of it was dropped.
- Each shapefile now ships a `.cpg` declaring UTF-8, so non-English attributes
  (Hebrew street names) open as written rather than as mojibake.
- The same header fault is fixed in the standalone DMA shapefile export.

## 1.124 — 2026-07-29 · *Updated feature + Bug fix* · **Important**
**The changelog is grouped by subject, and the Product Overview's tables render properly**
- **124 separate version entries are now 29.** Versions that were steps toward
  the same thing — the whole LeakZon export, meter imports, the sign-in failures,
  layer deletion, the screen saver — are merged into one entry each, so a run of
  small fixes reads as the single change it was. Nothing was dropped: every
  version from 1.000 to 1.123 is accounted for, and each entry lists which ones
  it covers.
- Entries that change **the way you work** are marked **Important** — data in and
  out, what a screen lets you do, or a fault that was costing time. Cosmetic and
  internal changes are not.
- **Fixed: tables in the Product Overview came out as a wall of `|` characters.**
  The panel was rendering the file without table support, so the two reference
  tables — the working views and the meter types — appeared as raw text. They are
  proper tables now, and scroll sideways rather than being crushed in a narrow
  panel.

## 1.108, 1.115 – 1.123 — 2026-07-29 · *New feature*
**Easter eggs on the GIS map: a coffee break, and a flood that turns into an aquarium**
- **Ctrl + Shift + C** brews a coffee: it fills for ten seconds with a countdown,
  then clears itself. Escape or "skip" ends it early.
- **Ctrl + Shift + F** floods the screen. Waves roll in as the water rises, and
  once it is full the tank comes alive — bubbles, ten fish, two sharks and three
  turtles, with drifting light and a slow swell in the water itself.
- Nothing swims in a straight line: every creature roams the whole screen on its
  own. Sharks hunt the nearest fish and open their jaws on the closing run; the
  fish sees it coming and bolts, out-turning the shark, which only wins by
  cutting the corner. A caught fish leaves a splash and returns seconds later.
  After a meal the shark loses interest for a while.
- It runs as a screen saver — no timer, **Escape** is the only way out — and the
  map underneath stays fully usable throughout.
- Both eggs work only on the GIS map; nowhere else in the app responds to them.

## 1.109, 1.110 — 2026-07-28 · *New feature* · **Important**
**Project type, and a Root flag on every meter**
- New projects choose a **Project type**: **AMI** (all meters read remotely) or
  **Hybrid** (a mix of remote and manual). New projects start on AMI; existing
  ones can be set from **Edit project** and show no type until you pick one.
- The meter editor has a **Root** field with **Yes / No** radio buttons. It is
  never blank — every existing meter starts as **No** — and it feeds the Root
  column in the LeakZon export.

## 1.041, 1.081, 1.104, 1.106, 1.107 — 2026-07-28 · *New feature + Updated feature + Bug fix* · **Important**
**DMA editing: a movable panel, fewer boundary points, and auto-DMAs that keep their rim meters**
- **Edit DMA can reduce the number of points in a boundary.** Opening the panel
  checks whether the outline can be drawn with fewer points and, if so, says how
  many there are now and how many there would be — *"50 → 34"* — and waits for
  you to choose. Nothing happens automatically, nothing is offered when the shape
  is already minimal, and an **Undo** restores the original. Only points sitting
  on a straight line between their neighbours are removed: across the existing 91
  DMAs the largest area change would be under 1%.
- **Auto-created DMAs no longer leave the outermost meters unassigned.** The
  outline was traced exactly through the rim meters, so those meters sat *on* the
  edge and counted as outside. Auto-created DMAs now get **25 m of breathing
  room**, which took "Obion Oren (test)" from 26 unassigned sub-meters to 0
  without any meter falling into two DMAs. DMAs already created keep their shape
  — re-create them to pick up the margin.
- The **DMA configuration and Edit DMA panels are floating and draggable**
  instead of blocking modals pinned over the polygon being edited, and Edit DMA
  has a green border matching the layer and meter editors.

## 1.138 — 2026-07-30 · *Bug fix* · **Important**
**"Complete missing GIS" found nothing it could place, and never said why**
- **Fixed: the same street written two ways counted as two streets.** A meter is
  placed by measuring between its located neighbours on the same street, and the
  streets were matched on their raw text — so a meter at *"1680 MARTIN DR"* was
  looking for neighbours filed under *"MARTIN DR"* while they were all under
  *"MARTIN DRIVE"*, and it found none. Street types, compass directions, trailing
  dots and ordinals are now read as the same street: **DR/DRIVE, ST/STREET,
  RD/ROAD, AVE/AVENUE, HWY/HIGHWAY, N/NORTH, W/WEST**, and so on.
- In Obion TN this took the meters it can place from **0 to 11** of the 43 that
  have no location, and merged 175 fragmented streets into 146 — which also means
  more reference meters per street, so the positions it proposes for every
  project are better founded than before.
- **Fixed: clicking it with nothing to place did nothing at all.** The tool asked
  for a confidence threshold and then closed silently. It now says how many
  meters are waiting, how many are on streets where no meter has a location yet
  (nothing to measure from), how many have no usable address, and what to do
  instead — the Mobile Locator, or setting a position from the map, where the
  address search will find most of them.
- Hebrew addresses are unaffected: the abbreviations being merged are English
  ones, and Hebrew street names group exactly as before.

## 1.136 — 2026-07-30 · *Bug fix* · **Important**
**Full route-by-route validation: two real faults found and fixed**
- Every route was loaded in a real browser against live data — dashboard, all
  seven project views, import/export, mobile locator, customer view and the 404
  page — and all 25 server functions were exercised. Two things were broken.
- **The dashboard's "force refresh" button had stopped working.** Recomputing the
  project figures now takes about 13 seconds across 24 projects and 78,000
  meters, which is longer than the database allows a single request to run, so it
  was cancelled every time and reported as "Internal error". The refresh is now
  allowed the time it needs, and the real reason is reported if anything else
  goes wrong. The scheduled 15-minute refresh was never affected — only the
  button.
- **"project.unassigned" was showing as raw text** in the project header on every
  view, wherever a project has no owner assigned. It now reads "No owner
  assigned", in both languages.
- No other route rendered a broken screen, and no other text on any screen is
  untranslated. English and Hebrew both carry all 973 phrases.
- The validation scripts are kept in the project (`scripts/validation/`) so this
  can be repeated in minutes rather than rebuilt from scratch.

## 1.145 — 2026-07-30 · *Bug fix* · **Important**
**The Mobile Locator link never worked when opened from the email**
- Opening the emailed link showed *"Failed to load meters — this link may have
  expired"* however fresh the link was. The link and its token were fine: the
  request was being turned away before it reached the platform, because a phone
  opening a link has nobody signed in and the app only identified itself when
  someone was. The share token was never even looked at.
- Both halves of the Mobile Locator were affected — listing the meters that need
  a location, and saving a position once you had walked to one. So the feature has
  not worked from a link since it was introduced, for anyone not already signed in
  on that device.
- The shared **Customer View** link was never affected; it is set up differently
  and has always been reachable without a login.
- Verified on a simulated phone with no stored login: the link now loads Obion
  TN's remaining meters straight away.

## 1.146 — 2026-07-30 · *New feature* · **Important**
**Mobile Locator redesigned: report what you find, and see what is around you**
- **A technician can now say why a meter could not be located.** Every meter on
  the list has a **Report an issue** action beside **Set location** — five common
  reasons are one tap each (not found, no access, buried or paved over, wrong
  address, removed from service) with room to add anything else.
- The note goes straight onto the meter and **shows in the Meter Data table with
  an amber icon**, the note itself as its tooltip. It also appears in the meter
  editor with the time it was sent, and a button to clear it once dealt with.
- The meter **stays on the list** after a note — it still has no location — but it
  is no longer anonymous. The list shows the note under the meter so the next
  person out does not repeat the trip, counts how many have been reported, and can
  filter to the reported ones or the ones nobody has looked at.
- **The map now shows what is around the pin.** Located meters, valves, hydrants,
  water mains, plant — every visible layer the project carries — drawn in the same
  colours the office sees, each labelled with its distance. That is what makes it
  possible to work out which house a missing meter belongs to by looking at the
  network rather than guessing from an address.
- The radius is yours to choose — **100 m, 250 m or 600 m** — and the surroundings
  follow the pin as you drag the map. Filtering happens on the server, so a phone
  on cell data at the roadside is not made to download a project's whole valve
  layer.
- A legend under the map names everything with its count, so nothing found reads
  as "nothing mapped within 250 m" rather than looking like a failure to load.

## 1.149 — 2026-07-30 · *New feature* · **Important**
**Consumption readings now carry a time, so hourly data can be imported**
- A reading was stored as a date and nothing more, so a meter could hold **one
  reading per day and no more** — an hourly file collapsed into 24 rows that
  looked identical and could not be told apart or put in order. AMI meters report
  hourly, so this was a ceiling on what the platform could hold at all.
- Every reading now has a **date and a time**. All 1,826,298 existing readings
  were given one, set to **00:00** on the day they already had, so nothing moved
  and every chart reads exactly as before.
- **The import works out for itself whether a file is hourly or daily** and says
  so before you commit to it — *"Hourly data — up to 24 readings per day across 1
  day"* or *"Daily data — 3 days, each stored at 00:00"*. It decides on two
  signals: a time written in the file, or the same date appearing more than once.
- **A file with no time of day is stored at 00:00**, shown as
  **01/08/2026 00:00**. That is what makes a daily file and an hourly one the same
  shape of data rather than two that cannot be compared.
- Times are read in the formats utilities actually use — `01/08/2026 14:30`,
  `2026-08-01T14:00:00`, `01/08/2026 2 PM` — and the day/month order of the date
  is worked out exactly as before, with the time attached rather than confusing it.
- The consumption table shows the time against each reading, and a meter's series
  is returned in chronological order, which with 24 readings a day is the only
  order that reads correctly.

## 1.153 — 2026-08-01 · *Updated feature*
**Sub-meter communication is now a choice, not free text**
- The setting was a text box, so a typo or a synonym went straight into the
  **Communication** column of the LeakZon export. It is now **AMI** or **AMR**,
  the only two answers a utility gives.
- Nothing is selected on a project that never set it, and those still export an
  empty Communication for their sub-meters exactly as before — no project's export
  changes until you choose. Main meters continue to export as AMI regardless.

## 1.161 — 2026-08-03 · *New feature*
**Customer Signature page (test)**
- Project Settings has a **Signature Page** toggle. Once on, it shows a
  shareable link (piggybacking on the Customer View link) that opens a plain
  page where the customer draws a signature on a pad and submits it — a quick
  test, not the final design.

## 1.159, 1.160 — 2026-08-03 · *Bug fix + Updated feature* · **Important**
**A DMA with no main meter could be marked as having one**
- **Obion's Zone 5 has no main meter, but export said 5 of 5 DMAs did.** A main
  meter inventoried under Zone 5 (its `dma_id`) was being read as proof Zone 5
  had a main feeding it — the same DMA/main mismatch already fixed once for
  point-in-polygon, now showing up through this second path instead.
- "Has a main" now means only one thing everywhere in the app: a DMA's
  `main_meter_id` is actually set. A main meter's own DMA tag no longer counts.
- Zone 5 now gets its **fictitious root meter**, like any other DMA with no
  assigned main. It now also gets an **Address** of `<DMA name>_Fictive` in the
  Meter Data sheet, and is marked **Is Root? = True** in the Groups sheet.

## 1.158 — 2026-08-02 · *Bug fix* · **Important**
**The export was silently dropping meters that shared an identifier**
- **Obion exported 672 meters out of 694.** The Meter Data file collapsed any two
  rows carrying the same **Identifier** — and the Identifier is not an identity,
  it is whatever fields you picked in the review step. Exporting with Identifier
  = *Address* meant two meters at one address became one row, and 23 meters never
  reached the file. Nothing said so; the file was just short.
- Among the meters lost was the main **"LeakZon 1"** (account 6001), which shares
  805 BATES ANDERSON with meter 751308 — so a DMA's main meter was missing from
  the export while its Groups row still named it.
- **Every physical meter is now written exactly once.** The collapse exists to
  fold the per-DMA copies of a main that feeds several DMAs back into one row;
  it now does that on the meter itself rather than on the text of a column.
- **The review step warns when the Identifier is not unique**, with the number of
  meters affected and examples of the clashing values. LeakZon matches on that
  column, so a shared value still merges rows on their side — but that is now
  something you see and can fix by adding a field, rather than a file that comes
  out short. For Obion, *Address* alone clashes for 23 addresses; adding
  *Meter ID* makes every one of the 694 unique.

## 1.152, 1.154, 1.155, 1.157 — 2026-08-02 · *New feature + Bug fix* · **Important**
**The consumption chart reads hourly data, and shows you where your data is**
- **The chart now supports hourly.** Where a meter reports more than once a day it
  offers **Hourly / Daily / Monthly**, and opens on the one that suits the project
  — hourly for a project set to **AMI**, daily otherwise. The choice only appears
  where the data can actually support it.
- **Fixed: a day was being reported as one hour of itself.** The chart kept the
  *first* reading of each day and discarded the rest — correct while a meter could
  only hold one reading a day, and silently wrong once it could hold 24. Readings
  are now added up within the period, so a daily point on hourly data is the day's
  real total.
- **A summary of where the data actually is** sits above the chart: how many
  readings, how many days carry data, how many are empty, the range they span,
  whether the meter reports hourly, and what the project is set to.
- **"Only periods with data"** leaves the empty stretches out instead of drawing
  them as zero — so a meter with one month of readings inside a year shows that
  month rather than a flat line either side of it.
- An AMI project, or any meter reporting hourly, no longer drops into the monthly
  view just because a few days are missing.
- **The Data table reads hourly too.** It had the same fault as the chart — one
  row per day, showing the first reading and dropping the other 23. It now offers
  **Hourly / Daily / Monthly** wherever the meter has the data, sums the readings
  within each period, and names the column *Date & time* when showing hours.
- **Weather is now off by default, behind its own button.** It was fetched from an
  outside service every time a chart opened; nothing is requested until you ask
  for it. Confirmed: no weather call goes out until the button is pressed.
- **The chart dialog has been reorganised.** The options had arrived one at a
  time and become an undivided row of eight buttons where nothing said which
  choice belonged to what. They are now in labelled groups — **Resolution**,
  **Period**, **Show** — and the two switches are icons, because they are on or
  off rather than a choice between alternatives.
- **"Monthly" no longer means two different things.** The old AMI/AMR switch and
  the resolution control both ended in a Monthly button for the same monthly bar
  chart. Resolution now owns it: choosing Monthly gives the bar chart, and the
  Period and Show controls step aside, since neither applies to it.
- The header now names the customer and address under the meter's UID, which is
  how anyone actually recognises which meter they are looking at.
- **The period now fits the data instead of the calendar.** A meter holding two
  days of readings opened on "Last 30 days" and drew them in one corner of a
  mostly empty month. Chart and Data list both open on **All data** — exactly the
  stretch the meter has readings for — unless there is a month or more, in which
  case Last 30 days still opens. All data is also a button, so it is one click
  back from any other period.

## 1.150, 1.151, 1.156 — 2026-08-01 · *Bug fix + New feature* · **Important**
**A consumption import that saves nothing now says so, and shows you why**
- **Fixed the actual cause: the import was writing too much at once.** Each batch
  sent up to **18,000 readings in a single write**, which takes the database
  around 18 seconds — well past the 8 seconds a request from the browser is
  allowed. Every batch was cancelled with *"canceling statement due to statement
  timeout"*, and before the fix above that refusal was thrown away, which is why
  an import could finish with no data and no complaint.
- Readings are now written **2,000 at a time, three at once**. Measured on this
  project: 2,000 rows take about 3.3 seconds and 5,000 about 7.4 — 2,000 leaves
  room for a slow moment without going over.
- Verified with a full-size import into Obion TN: **694 meters × 24 hourly columns
  = 16,656 readings, saved in 12 seconds**, all 24 times of day stored distinctly.
  (The test data was removed afterwards.)
- **Optimize Data Files now writes in the same safe chunks.** It was still
  sending 5,000 readings per write, which measures at **7.7 seconds** against the
  8 seconds a write is allowed — no margin at all, and it had grown slower since
  readings started carrying a time. It now writes 2,000 at a time, measured at
  **4.1 seconds**.
- **Fixed the silent failure.** The import counted every reading it *built* and
  announced them as saved without ever checking whether the database accepted
  them. A refused batch was reported as a success — which is how an import could
  finish with "Done!" and leave the project with no consumption data at all. Any
  refusal now stops the import and shows exactly what the database said.
- **Every import now ends with a summary**: rows read, reading columns selected,
  readings saved, and each reason anything was skipped — UID not in this project,
  row with no UID, value that is not a number, date that could not be read.
- **The rows that failed can be downloaded as a CSV**, with the original columns
  plus *why it was skipped* and the offending value, so a file can be corrected
  and re-imported instead of guessed at.
- **A run that saves nothing no longer closes itself** and no longer looks like a
  success — it stays on screen, marked amber, naming the most likely cause. If
  the reading columns held text it says so directly.
- **The columns are checked before you commit to the import.** Choosing the
  reading columns now reports how many of their values are actually numbers in the
  first 200 rows — *"✓ 1,368 numeric values"*, or a red *"No numbers in these
  columns — every value is text"*, which is the mistake that produces an empty
  import.
- **The summary now stays on screen instead of being swept away.** A successful
  import used to jump to "Go to Map" about a second and a half after showing the
  summary — barely enough time to read it. It now waits for you: press
  **Continue** when you're done looking, and only then does the "Go to Map"
  screen appear.

## 1.013, 1.064, 1.070, 1.083, 1.085, 1.088, 1.089, 1.105, 1.128, 1.133 – 1.135, 1.137, 1.139 – 1.144, 1.148 — 2026-07-30 · *New feature + Updated feature + Bug fix* · **Important**
**Meter data: edit from the map, multi-DMA mains, real ID columns, and deletes that work**
- **A meter can now be added by hand.** An **Add meter** button in the meter table
  opens the same editor used for an existing meter, so a meter typed in is
  described exactly like an imported one — same fields, same rules.
- **It joins the right layer automatically**: a main goes to the project's Main
  Meters layer, anything else to Sub Meters, and the layer is created if the
  project does not have one yet. A meter with no layer never appears on the map
  however good its coordinates are, which is the trap this avoids.
- Its position counts as placed by hand, so it carries the same marker as any
  other manually positioned meter. A UID is required — everything else can be
  filled in later.
- **Edit Meter now has Meter ID and Account ID, and is laid out in groups.** The
  two IDs were shown in the meter table but could not be edited anywhere — they
  are stored differently from the other fields, and the editor simply had no box
  for them. Editing one keeps the label the source file used, and clearing it
  removes the value rather than storing a blank.
- Any other IDs the import carried are listed under them, read-only, so nothing
  attached to the meter is hidden.
- **The meter table's search now finds a meter by its Account ID or Meter ID**,
  and by its Endpoint ID, on top of UID, name, address and provider. Searching
  an account number previously returned nothing at all: the search runs in the
  database over real columns, and those IDs are not stored as columns.
- It matches the ID *values* only, so searching a word like "account" doesn't
  return every meter that happens to have an account number.
- **The meter table has been re-laid out.** A new **Sub-DMA** column sits beside
  DMA, holding the area that meters a main as one of its consumers — blank for a
  sub-meter, where it never applies.
- **Status is no longer a column.** It reads as a coloured stripe down the left
  edge of each row: teal for active, grey for inactive, nothing where the status
  was never recorded. It stays available to screen readers.
- **Coordinates are smaller and stacked** — latitude above longitude, with the
  altitude beneath — instead of one long line that was the widest thing in the
  table.
- **A location that didn't come from the import file is now marked, and says how
  it got there.** A small icon sits beside the coordinates: **calculated** from
  the meters around it, **looked up** from the address, **located in the field**
  with the Mobile Locator, **placed by hand**, or **generated** for an export.
  An imported location gets no icon, so the marked ones stand out.
- **Fixed: moving a meter was not recorded at all.** Typing coordinates into the
  meter editor, or dragging the pin on its map, left the meter looking exactly
  like one whose position came from the file. It is now marked as placed by hand.
- **Fixed: the Mobile Locator was recording its positions as "geocoded"** — as if
  looked up from an address, when in fact someone was standing at the meter with
  their phone. Those are now marked as located in the field, which is the most
  reliable kind, not the least.
- The map popup names the same five cases; it could previously only say
  "geocoded" or "estimated from street data" whatever had actually happened.
- **Fixed: setting a meter's location by dropping a pin appeared to save and did
  not.** The two new labels above — "placed by hand" and "located in the field" —
  were not on the database's list of permitted values, so it refused every one of
  those saves. The list now includes them.
- **Fixed the reason nobody was told.** Both places that save a location threw the
  database's refusal away and carried on as if it had worked: the pin cleared, the
  view switched back, and the meter was unchanged. They now report exactly what
  the database said and keep your pin on screen so nothing is lost.
- Only saves made in the last few hours were affected, and only the pin and
  Mobile Locator paths — no data was altered or lost, the writes simply never
  happened.
- **New "No location" filter** in the meter table, showing only the meters that
  still have no coordinates — the ones the mobile locator and the estimation
  tools exist for. It carries its own count, and it stacks with everything else:
  Sub + No location, or a search + No location, both work.
- The count on the button always reports how many meters need a location, not how
  many are currently on screen, so it doesn't collapse to the number you are
  already looking at once the filter is on.
- **The meter table's buttons are grouped by what they do.** They were in one
  undivided row in no particular order. Now there are three clusters, each in its
  own frame: **narrowing the view** (the type filters, No location, Select
  Meters), **taking data out** (Export Anomalies), and **locating meters**
  (Complete missing GIS, Mobile Locator).
- **"View on map" switches to the map, zooms to the meter, and keeps the point
  blinking until you do something.** The amber disc flashes for as long as you
  need to find it — no timer — and stops the moment you click, type, scroll or
  pan. The zoom stays where it put you, and the usual highlight ring remains so
  the meter is still marked afterwards.
- Clicking the same meter again blinks it again; previously a second click did
  nothing at all.
- **The "Meter Data" heading is gone and the meter count takes its place**, at
  three times the size — the view is already named in the side menu, and the count
  is what anyone actually reads there. It follows the active filter, so it shows
  the number of rows you are looking at.
- Export Anomalies moved to the far right, after the locating tools, so the order
  runs from narrowing the view, to acting on it, to taking it out.
- **Fixed: on a 1280px screen the Mobile Locator button was cut off entirely.**
  The pane holding the view was 1423px wide inside a 1280px window and the excess
  was simply clipped, so the toolbar could never wrap. It now shrinks to the
  window and the buttons wrap onto a second row when they need to — checked at
  1600, 1280 and 1024px, with nothing clipped and no sideways scrolling.
- The panel was one column of eleven inputs, which put unrelated fields
  side by side. It is now grouped into **Identification**, **Customer**,
  **Location**, **Role in the network** and **DMA links** — and the DMA section
  disappears entirely for a sub-meter, where it never applied.
- **Edit a meter straight from the map.** Clicking any meter — main, insertion,
  ultrasonic or sub — offers **Edit meter details**, opening the same editor as
  the Meter Data table, with everything editable: UID, account, address,
  provider, diameter, coordinates, type and DMA links. Saving refreshes the map
  and the DMA panel immediately. Hidden on locked projects.
- The editor is a **floating, draggable panel** rather than a centred dialog —
  keep working on the map underneath while it is open.
- **A main meter can serve more than one DMA**, and shows as **one row** listing
  them all ("North DMA, North Central") instead of only the first. **No meter is
  ever listed twice** — a main that is also metered as a sub-meter of a
  neighbouring DMA used to get a second row for that role; it now has a
  **Sub-DMA** column on its own row instead, so a UID appears exactly once.
- New **Sub-Meter in** field beside **Linked DMA**, for the DMA that meters a
  main as one of its consumers. Both dropdowns mark a **(recommended)**
  suggestion worked out from the network, but nothing is ever selected for you.
- **Removing a main meter from a DMA now clears the DMA on that meter**, in the
  table and in the export. A main serving several DMAs keeps the others.
- The table shows **Meter ID, Account ID and Endpoint ID** next to the UID
  (**Comm.** and **Additional IDs** removed) — and the reason those columns would
  have been empty is fixed: importing kept only *one* extra ID column and threw
  the rest away. Re-import to pick up Account ID; the discarded values aren't
  recoverable.
- **16,371 meters with no status are now Active.** They read "N/A" because their
  source file had no status column. The 1,203 explicitly marked inactive were
  left alone.
- **Deleting a main meter now works instead of silently doing nothing.** The
  database refuses to delete a meter a DMA uses as its main, and that refusal was
  only written to the browser log. The DMA is now unlinked first, the
  confirmation **names the DMAs that will be left without a main**, and a failed
  delete says so instead of closing quietly.
- **Fixed:** sub meters showed a blank DMA even when they sat inside one.
- **Fixed: the "Sub-Meter in" DMA could not be picked on a main meter.** The
  dropdown was opening *behind* the editor panel, so it looked like the field
  simply refused to select anything, while "Linked DMA" just above it worked.
  Which of the two broke depended only on where the panel sat on screen: a menu
  with room below spills past the panel edge and stays usable, one near the
  bottom flips upward and lands underneath it.
- The same fault applied to every dropdown, tooltip and menu inside the floating
  layer, DMA and meter editors. It is fixed once for all of them rather than one
  dialog at a time, so it cannot come back on the next panel someone adds.

## 1.101, 1.103 — 2026-07-28 · *New feature + Bug fix*
**Product Overview — how the platform works**
- A **Product Overview** section sits above the changelog in Version Updates. It
  describes the dashboard and every working view, then each component — layers,
  meters, DMAs, isolation points, consumption, annotations and the customer view
  — and walks the nine onboarding steps in order.
- Headings are colour-coded: **blue** sections, **green** components, **amber**
  wizard stages.
- It is kept as a file in the project (`Product_overview.md`), editable like the
  changelog and published with each release.
- **Fixed:** it was borrowing the changelog's styling, which is built for a
  version list — greyed cramped body text, every bold phrase green, a rule above
  each section. It now has its own typography, tables, dividers and note boxes.

## 1.018, 1.102, 1.147 — 2026-07-30 · *New feature + Bug fix*
**Network design shows main meters, and brings linked DMAs across together**
- A DMA block shows its **main meter** with a blue inward arrow. Where that meter
  is also billed as a **sub-meter of a neighbouring DMA**, both blocks say so —
  the supplying DMA notes "also sub in …", the neighbour shows an amber outward
  arrow — so the two roles are never confused.
- **Dragging one of a linked pair brings the other with it**, already connected,
  with the arrow running from the DMA that bills the meter to the one it
  supplies. The DMA list marks these **"+ linked DMA"** before you drag.
- Leaving the Network Design view after making changes offers to mark the
  wizard's **Design Network Flow** step done. "Not yet" won't ask again until you
  change something else.
- **Fixed: the smaller blocks were too small for what they had to say.** A block
  is sized by its DMA's real area, and a small DMA landed at a size that could not
  hold its name, meter count, main meter and "also sub in …" line — so text was cut
  off mid-word or spilled outside the box.
- Every block is now at least as big as its own contents, measured from what is
  actually on screen rather than guessed from the text, and still grows with area
  above that. On Obion TN the two crowded blocks went from 108×38 and 89×37 to
  139×42 and 121×41; the larger blocks are unchanged.
- Checked across the projects that have a network design, including one with
  Hebrew DMA names: nothing clipped, nothing overflowing, in any block.

## 1.036, 1.046, 1.047, 1.067, 1.096 – 1.100 — 2026-07-28 · *Updated feature*
**The version number moved into a strip along the bottom of the project page**
- A strip now runs across the bottom of the project page, **28px** tall, sharing
  its background with the side menu (white in light mode) and with no divider
  above it — the line only split one surface in two. The map gives up the space,
  so the strip is the same height at any window size.
- The version sits on the **left** of that strip, with the update badge beside
  it, and the Import / Export page has the same strip — so the version is in one
  place throughout a project.
- The login screen shows the version too, and Version Updates moved to the bottom
  of the dashboard side menu, above Settings.

## 1.014, 1.026, 1.029, 1.032, 1.037, 1.091, 1.093 – 1.095 — 2026-07-28 · *New feature + Updated feature + Bug fix*
**Layer styling: one palette, dark colours, an octagon, and a panel that fits**
- **Edit Layer is grouped into sections** — Details, Colour, Shape & size, Pipe
  widths — instead of one long list, with **Save** and **Cancel** pinned to the
  bottom and only the middle scrolling.
- **One colour palette instead of two.** Shape and outline colour share a palette
  with a small Shape / Outline switch; two stacked palettes made the panel taller
  than the screen, which is what pushed the buttons out of view.
- **Filled means filled.** Sub-meters were locked to 45% fill whatever the layer
  said, so they never looked filled — worst with a dark colour. Inactive meters
  are still shown faded.
- **Added 13 dark colours** plus white and black, and a separate **outline
  colour**, honoured everywhere a point is drawn — map, panel swatch, legend and
  customer view. **Octagon** joins circle, star, square and triangle.
- **Custom layer icons removed.** Layers are styled with shape, size, colour and
  outline. Two layers in "Woodlawn - Internal" that still used an icon now show
  their shape — an icon hid the shape controls, so leaving them would have made
  them impossible to restyle.
- **Default shape / size / colour per component type** in dashboard Settings
  (Main, Sub Main, Insertion, Ultrasonic, Valves), applied to new layers on
  import, with an **Apply** button to pull them into an existing layer.
- The layer settings panel is **floating and draggable**, sized to its content;
  and its category dropdown, which briefly opened *behind* the panel, opens on
  top again.

## 1.092 — 2026-07-28 · *Bug fix* · **Important**
**The ruler can be used anywhere, including on top of components**
- Measuring points could not be placed on a meter, valve or pipe — the click was
  taken by that component, so you had to aim at bare map beside it. Exactly where
  a measurement is most often wanted. Clicks now reach the map wherever you point
  while the ruler is active.
- The measurement line, its points and its distance labels draw **above every
  layer**, so nothing can hide what you are measuring.

## 1.028, 1.090 — 2026-07-28 · *Bug fix*
**Fixed two black screens**
- Opening a project showed a black screen: the meter editor used something that
  was never imported, which crashes the page the moment it renders. Only the
  preview site was ever affected.
- Turning on point numbering did the same, after a rewrite removed three helper
  functions the point-building code still called. A second crash found while
  verifying it — a call-stack overflow on layers with many points — is fixed too.
- The project checks now catch this class of mistake before it can ship. It had
  slipped through twice, because building the app doesn't reveal it; only running
  the page does.

## 1.012, 1.015, 1.020, 1.030, 1.031, 1.045, 1.061, 1.087 — 2026-07-28 · *New feature + Updated feature + Bug fix*
**Projects dashboard: live figures, sorting, a country per user, and clearer cards**
- **The meter and DMA figures were frozen** — a stored snapshot nothing was
  updating. Obion TN showed 4 imported meters and 0 assigned against 599 and 594
  actually in the project, and a newly created project was missing from the chart
  entirely. The job that keeps them current was never set up when the platform
  moved off Base44; it now runs **every 15 minutes**, and the figures have been
  refreshed once already.
- **Each user can have a default country** for the dashboard, shown as a
  **Country View** column in the user list. It is only a starting point — the
  country menu still works as before and switching doesn't overwrite it.
- **Sort projects** by name, last used or progress %, in either direction;
  default is last used, newest first.
- Locked projects are tinted amber across the grid, the lock indicator sits
  inline before the DMA count, Settings moved to the bottom of the sidebar, and
  the Projects icon matches the one inside a project.
- Opening a project shows the LeakZon wordmark filling with water instead of a
  spinner, and the app has a new icon (favicon, tab, home screen).

## 1.007, 1.055, 1.056, 1.058, 1.080, 1.086, 1.130 – 1.132 — 2026-07-29 · *Updated feature + Bug fix* · **Important**
**Meter imports: nothing silently dropped, the file decides what is a main, and DMA names survive**
- **Meter ID and Account ID can now be matched during the import**, alongside
  the UID and the Endpoint ID. All four are picked from your file's columns in
  the mapping step, and the platform suggests a match for each.
- This is what makes them work on a file that doesn't use those words: they are
  stored under a fixed label rather than under whatever the source column was
  called, so a file with **MTR_NO** and **ACCT** now fills the Meter ID and
  Account ID columns in the meter table and in the LeakZon export. Previously
  only a column already named something like "Meter ID" was ever found.
- Any other ID columns you tick are still kept alongside, unchanged.
- **A matched field is now green in the mapping step**, with a tick beside its
  name, and an unmatched one stays grey — so which fields will actually be
  imported is visible at a glance instead of having to read down every dropdown.
  A running **"7 of 17 fields matched"** count sits above the list.
- **New: top up an existing layer with only the meters it doesn't already have.**
  The meter import now asks whether the file should **create a new layer** or be
  **added to an existing one**. Choosing an existing layer imports only the
  meters whose UID isn't already in the project — everything already stored is
  left exactly as it is, not updated, not replaced.
- The new batch comes in as **sub-meters** and joins the layer you picked, which
  is offered with its current meter count so it is clear which one you are
  adding to. A UID repeated inside the file itself is imported once.
- The result says both numbers: how many were added, and how many were skipped
  because they were already there.
- **Imports were creating no meters at all.** A meter CSV/Excel import built the
  layer but not a single meter — nothing on the map, nothing in the table — and
  still reported success, because it sent a field that is no longer a column and
  never noticed the database rejecting every batch. Bulk imports now stop and
  show the real error instead of reporting rows they never saved.
- **DMA names from the file are kept.** They used to be thrown away unless a
  matching DMA already existed — which on a first import is never — so
  "Auto-Create DMAs" reported none straight after announcing they were detected.
  The name is now stored with each meter, and once the areas are created the
  meters that named them are linked automatically.
- **The file decides which meters are mains.** An **"Is Main"** field
  (`is_main`, `IsMain`, `Is Main`, `main_meter`) is honoured meter by meter;
  `yes / true / 1 / Y / main / primary / master` mean main. **With no such field,
  meters import as sub meters** — unless the layer is explicitly a main type by
  category or name. Columns like `MAIN_ID` or `MAIN SIZE` are ignored, so a
  pipe-diameter column can't mark a whole layer as mains.
- **Imported meters default to Active** unless the file clearly says otherwise
  (*inactive, no, false, 0, not active, disabled, off, dead*). Applies to meter
  files, the carbon copy import, and meters created from a map layer.
- **Layer categories are detected instead of defaulting to Other**, which is what
  left meter layers showing a feature count but 0 meters. A split import creates
  **Main Meters** and **Sub Meters** layers; meter-type shapefile/GeoJSON imports
  create real meter rows. The plain **"Meters"** category was removed as
  confusing, **Ultrasonic Meters** added as a real category.
- **Repair for a layer already imported wrong:** open its settings and set the
  category — saving creates the missing meter records from the layer's own
  points, and only when it has none, so it can't duplicate them. Re-import to
  pick up DMA names.

## 1.010, 1.011, 1.049, 1.051, 1.078, 1.084 — 2026-07-27 · *New feature + Bug fix* · **Important**
**Customer view: design approval, and both sides staying in step**
- The customer can **approve the network design** from the shared view. They
  confirm and enter their name, the dialog spelling out that approving locks the
  project. On approval the project locks in their name, a green banner appears,
  and every wizard step except "Export to LeakZon" is marked done. Unlocking in
  Project Settings withdraws the approval.
- **The project page and the customer view keep each other up to date.** A
  customer annotation raises the badge in the project side menu on its own; a
  **Request Design Approval** makes the approve button appear in a customer's
  already-open page, pulsing gently until noticed; an approval locks the project
  page and tells you who approved. Both sides check every 15 seconds and on tab
  focus, with a 162-byte check rather than a full reload.
- **Fixed:** every annotation in the customer view appeared as an untitled
  "Drawing" with nothing drawn — comments lost their text, arrows their
  direction. They were being read in a format the database no longer uses, a
  leftover from the Base44 migration. Nothing was lost, only misread, and they
  reappeared on their own.
- **Fixed:** "Approve this design" appeared to do nothing and froze the page —
  the confirmation opened underneath the map while its backdrop swallowed clicks.
- Customer view links can be **extended** — a calendar-plus button adds days to
  an expiry, and extending an expired link reactivates it. Project
  export/import now includes customer annotations.

## 1.001, 1.003 – 1.006, 1.082 — 2026-07-27 · *Updated feature + Bug fix* · **Important**
**Deleting a layer: asks first, shows progress, and no longer takes other layers' meters with it**
- Deleting a layer **asks for confirmation** and states it cannot be undone.
  When the layer has meters it says **how many will be deleted** along with their
  consumption history, so thousands of meters can't go on a stray click.
- A **progress bar counts down from 100% to 0%** naming each stage: unlinking DMA
  main meters, removing isolation points, deleting meters and readings, removing
  the layer. Large layers take a while and it was previously impossible to tell
  whether anything was happening.
- **Fixed data loss:** deletion removed meters by source file, but two layers
  imported from one file (a "Main" and a "Sub" from the same CSV) share it — so
  deleting one wiped the other's meters. Meters are now deleted by layer.
- **Fixed silent failures:** a layer can't be deleted while meters or isolation
  points reference it, and its meters may be referenced by a DMA's main meter.
  Those references are now unwound first, for every layer type, and any error is
  surfaced. Layers with more than 1,000 meters no longer stay undeletable.
- Deletion is also much faster — a redundant scan of every reading in the project
  on each layer delete is gone.
- **Fixed:** manual meter layers duplicated their points on save for the same
  foreign-key reason.

## 1.079 — 2026-07-27 · *New feature + Bug fix* · **Important**
**Valve points can be moved on the map**
- Any imported point layer — valves, hydrants, structures — now has the same
  **edit points on map** button manual layers have: turn it on, drag a point to
  its correct position, save. Useful where a surveyed valve sits a few metres off.
- **Fixed a data-loss risk found while adding this:** saving a point layer
  rebuilt each point from a short fixed list of fields, discarding every other
  attribute. Woodlawn's valve layer carries 21 columns — diameter, condition,
  turns, install date, GPS accuracy — all of which a single point move would have
  wiped. Every attribute is now kept; only the coordinates change.
- Line and boundary layers are deliberately excluded: they have their own editors.

## 1.021, 1.053, 1.066, 1.068, 1.071, 1.072, 1.075 – 1.077 — 2026-07-27 · *Bug fix* · **Important**
**Sign-in: no more empty dashboard, "Project not found", or being bounced back**
- One root cause behind most of these: a sign-in can quietly expire on the server
  while the app keeps a local record saying you are still signed in. It then
  looks logged in while the database refuses everything — an empty dashboard,
  "Project not found", or a bounce back to the dashboard. The app now notices and
  takes you to the **sign-in screen** instead of pretending.
- **The dashboard could come up completely empty and stay that way.** The project
  list loads as the page opens but the saved sign-in is restored a moment later,
  so the request went out unauthenticated and the empty result was cached for an
  hour. Every page that loads data on open now waits for the sign-in first,
  through one shared piece of code, and an empty list is never cached.
- **"Project not found" is no longer shown for two different situations.** It now
  names the account it was signed in as and points out that **each web address
  keeps its own sign-in** — the preview and live sites do not share one.
- **A LeakZon user could be refused a project an admin opened fine**: their token
  carried an out-of-date account type. The app now renews the sign-in
  automatically and retries once. LeakZon accounts also had no global project
  access at all in the authorization rules and saw "No Projects yet."
- **"Forgot password?" now actually sends the email.** The flow generated a PIN
  and told you to check your inbox, but the sending step was never finished
  during the migration. The PIN expires after 30 minutes, works once, does not
  change your current PIN until you complete the reset, and is no longer written
  to the server logs.
- **Fixed the empty dashboard after setting or resetting a PIN** — both paths
  signed you in without creating a session.

## 1.000, 1.017, 1.048, 1.050, 1.060, 1.073, 1.074 — 2026-07-27 · *New feature + Updated feature*
**The changelog, and being told when a new version is out**
- This changelog, the version number under the logo, the one-line headline on
  every entry, and the **Bug fix / New feature / Updated feature** tag — orange,
  so it stands apart from the blue version and date.
- The app **checks hourly, and whenever you return to the tab**, whether a newer
  version has been released, and shows an amber badge beside the version number.
  Clicking it explains which version you are on and offers to refresh, warning
  that unsaved work is lost.
- A **refresh button on the changelog** pulls the newest entries from the live
  site, since the panel otherwise shows the copy that shipped with your tab.
- **The preview site reloads itself** within 30 seconds of a new build, clearing
  caches first. Production still asks first, so nobody loses work mid-task.

## 1.044, 1.069 — 2026-07-27 · *Updated feature*
**Vercel Speed Insights added, then switched off**
- Added to report real page-load performance, then switched off while chasing a
  flicker seen when moving the mouse over the map on the live site only. It is
  the one thing that genuinely runs on live but not preview, and it hooks into
  every mouse interaction. The flicker stopped and it stays off.

## 1.059 — 2026-07-26 · *Bug fix*
**Import dialogs are readable in dark mode**
- The meter import flow was built with fixed light colours and no dark variants —
  dark grey text on dark panels, white blocks where a tinted note should be. The
  upload dialog, column mapping, consumption upload and undo import now follow
  the theme, with note tints that sit correctly on either background.

## 1.057 — 2026-07-26 · *New feature*
**Preview builds are marked with a red PREVIEW label**
- A small red **PREVIEW** appears under the logo on the dashboard, inside a
  project and on the login screen, so a preview build is never mistaken for the
  live site. Production (`ob.leakzon.app`) never shows it.

## 1.054 — 2026-07-26 · *New feature* · **Important**
**Admins can sign in as a user to reproduce what they see**
- An admin can enter a **user's email with their own PIN** and be signed in as
  that user, for activated accounts only. Only Admin / Super User / LeakZon PINs
  are accepted — a regular user's PIN can never open someone else's account.
- An amber "Support login — viewing as …" bar stays visible for the whole
  session with an End button. Every use is recorded, and it does not touch the
  user's own "last login".

## 1.019, 1.027, 1.042, 1.052 — 2026-07-26 · *New feature + Updated feature* · **Important**
**"Find border valves" for isolation points**
- Highlights the valves sitting on a border between two DMAs — the likely
  isolation valves — to speed up marking them. Needs at least two DMAs and a
  valve layer. Replaced the "Isolation DMA View" toggle.
- **A single valve on a shared border is now found.** It previously needed a
  second valve from the neighbouring DMA right beside it, and borders are very
  often isolated by one valve. On a real 9-DMA project with 6,324 valves,
  findings went from 28 to 173 and DMA coverage from 5 to 7 of 9.
- Valves already marked as isolation points are no longer highlighted, so the
  results shrink as you work through them — but they still count when pairing.
- The search distance is the **Isolation Valve Distance** setting, shown in the
  project's own unit: 60 m metric, 200 ft imperial.

## 1.043 — 2026-07-26 · *Bug fix* · **Important**
**The Mobile Locator link from the email works again**
- Opening the emailed link failed with "Failed to load meters" or bounced to the
  login screen. It is meant to be used in the field without logging in, but the
  meter endpoints required a logged-in user.
- The link now carries a secure token valid for 30 days, the same mechanism the
  customer view uses. Requests without one are still refused. **Links sent before
  this fix won't work** — send a fresh one.

## 1.034, 1.038 – 1.040 — 2026-07-26 · *Updated feature*
**Consumption charts and distance settings**
- Consumption lines are **blue for main and insertion meters, green for
  sub-meters**, across the line, bar and monthly views including axis labels.
- **Data Completion is removed** — the wand button, estimated-values line,
  results panel and its project setting — along with the zero-value and spike
  shading that was the last part of it.
- "Boundary Deviation Distance" and "Isolation Valve Distance" are **sliders**
  with the value shown live, 0–500 ft (metric projects show 0–150 m), defaulting
  to 100 ft / 30 m. Existing projects keep their current values.

## 1.016, 1.035 — 2026-07-25 · *Updated feature + Bug fix*
**Project lock**
- **Lock/unlock was never saving.** The toggle wrote a field that isn't a real
  column, so the whole update was rejected silently. A failed project update now
  shows an error instead of doing nothing.
- Layers can no longer be dragged to reorder on a locked project — previously the
  drag ran and simply did nothing on drop.

## 1.033 — 2026-07-25 · *Updated feature*
**Map legend renamed and rolls up smoothly**
- The panel is titled **Legend** (was "Map Layers") and collapses with an
  animation instead of vanishing. Applies to the project map and customer view.

## 1.008, 1.009, 1.023 – 1.025 — 2026-07-25 · *New feature + Bug fix*
**Point numbering: correct order, per-DMA focus, and style controls**
- **Numbering now genuinely reads left-to-right, top-to-bottom.** The row
  grouping capped its band at 60 m, so on projects spanning kilometres every
  point became its own row and the order collapsed to north-south. Rows are now
  fixed horizontal stripes, verified against real project data and against
  horizontal, vertical and grid layouts. Badges in a tight cluster read in order
  too.
- With a DMA focused, numbering **shows only that DMA's points** — inside the
  polygon, within the boundary-deviation distance, plus its linked main meter —
  while each point **keeps its global number**, so it never renumbers.
- A **Number Style** control sets badge size and colour, for all numbers or only
  selected ones, saved per project and applied in the customer view. Default is
  red on white.

## 1.022 — 2026-07-25 · *Updated feature* · **Important**
**Map layer order follows the panel exactly, and DMAs sit at the bottom**
- DMA polygons now render **beneath every layer** instead of shading the layers
  above them; their name labels stay on top.
- **Dragging a layer in the panel really changes its z-order**, and hide/unhide
  only changes visibility — unhiding no longer jumps a layer to the top. Meter
  layers were previously forced above all shapefile layers, silently overriding
  manual ordering.
