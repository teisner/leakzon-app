# LeakZon Onboarding Platform — Product Overview

The Onboarding Platform is where a water utility's network is prepared before it
goes live in the LeakZon Main Platform. A project starts as a pile of GIS files
and meter spreadsheets, and finishes as a validated network — meters located,
areas drawn, flow mapped, approved by the customer, and exported.

This document describes every part of the platform and then walks the same
ground in the order the Onboarding Wizard does.

---

## Where things live

### Projects Dashboard

The first screen after signing in. Every project appears as a card showing its
progress, meter count, DMA count and a completion percentage.

- **Search and sort** — by name, last used or progress, in either direction.
- **Country filter** — narrow to one country. Each user can be given a default
  country so their dashboard opens on the region they work in.
- **Archive** — finished projects move out of the main list without being
  deleted.
- **Lock** — a locked project is read-only. Locked cards are tinted amber and
  carry a lock icon next to the DMA count.
- **Export / Import / Duplicate** — a whole project can be exported to a file
  and restored or duplicated elsewhere.
- **Users** — accounts and their type. **Settings** — default shape, size and
  colour for each component type, applied to newly created layers.

> The figures on each card are a stored snapshot refreshed every 15 minutes, so
> they can lag slightly behind a very recent import. The refresh button forces
> an immediate update.

### Project workspace

Inside a project the left menu holds the working views:

| View | What it is for |
| --- | --- |
| **GIS Map** | The map itself — layers, DMAs, isolation points, annotations, measuring |
| **Meter Data** | Every meter as a table, with editing, filtering and export |
| **Network Design** | The flow diagram from source through the DMAs |
| **Wetwork Inventory** | Insertion meters and the physical work list |
| **Import / Export** | All data in and out |
| **Customer View** | The shared, read-only link for the customer |
| **Version Updates** | Changelog, this overview, and change requests |
| **Settings** | Project-level options |

---

## The components

### Layers

A layer is one set of map features — water lines, valves, hydrants, meters, a
city boundary. Layers come from shapefiles, GeoJSON, or are drawn by hand.

- **Category** decides what a layer *is* (Water Lines, Valves, Main Meters, Sub
  Meters, Insertion Meters, Ultrasonic Meters…), and is detected from the file
  name on import.
- **Styling** — shape (circle, star, square, triangle, octagon), size, fill
  colour and a separate outline colour. Line layers are styled by pipe diameter
  instead.
- **Order** — the layer panel order is the drawing order. Dragging a layer
  changes what covers what; DMAs always sit at the bottom. Hiding a layer
  changes only its visibility, never its order.
- **Editing points** — any point layer can be opened for editing and its points
  dragged to the right position. All other attributes are preserved.

### Meters

Meters are records, not just dots. Each carries a UID, meter ID, account ID,
endpoint ID, account name, address, provider, diameter, status and coordinates.

- **Main meters** measure water entering a DMA. **Sub meters** are the
  consumers inside it. Insertion and ultrasonic meters are main-type meters.
- A main meter can serve **more than one DMA**, and can additionally be metered
  as a **sub-meter of another DMA** — the case where a boundary meter feeds one
  area while being billed to its neighbour.
- Meters can be edited from the table **or** directly from their map popup.
- Meters with no coordinates are flagged and can be located by estimation, by
  the Mobile Locator, or by pinpointing them by hand.

### DMAs — District Metered Areas

A DMA is a polygon with a main meter. Water entering through that meter should
equal what the sub-meters inside record, plus losses — that difference is what
LeakZon exists to find.

- Drawn by hand, or **created automatically** from the DMA names in the imported
  meter file.
- Each has a name, colour, transparency, and a linked main meter.
- **Zoom to DMA** focuses one area; **Highlight unassigned** shows meters that
  fall outside every DMA.

### Isolation points

Valves that close a DMA's boundary. **Find border valves** locates valves sitting
between two DMAs and highlights the ones still to be marked, skipping any
already recorded.

### Consumption

Readings are matched to meters by UID. The platform charts consumption per meter
and per DMA — main meters and insertion meters in blue, sub-meters in green —
and flags **anomalies**: meters reading zero, reading far below their history,
or missing readings entirely.

### Annotations and the customer view

A share link opens a read-only map for the customer, with an expiry date. The
customer can leave comments, arrows and drawings; those appear on the project
side with a badge, and arrive without needing a reload. The project side can
place its own notes and arrows, and can request the customer's approval of the
design.

---

## The onboarding flow

The wizard tracks nine steps in four stages. Progress is recorded per step and
shown as a percentage on the dashboard.

#### Stage 1 — Import Data

**1. Import Shapefiles** — upload GIS layers: water lines, valves, hydrants,
tanks, the city boundary. A ZIP with several shapefiles imports them all at
once, each becoming its own layer with a detected category and style.

**2. Import Meter Data** — upload the meter file (CSV or Excel). Columns are
matched to fields automatically and can be corrected before importing. Where the
file marks which meters are mains, that decides it; otherwise everything is
imported as sub meters. If the file names DMAs, those names are kept for the
next stage.

**3. Import Consumption Data** — upload readings, matched to meters by UID.

#### Stage 2 — Analyze Data

**4. Complete Missing GIS** — meters without coordinates cannot be assigned to a
DMA, so they must be located first. Three routes: automatic estimation from the
address, the **Mobile Locator** (a link sent to someone in the field who stands
at the meter and records its position), or pinpointing on the map by hand.

**5. Export Meter Anomalies** — review meters whose consumption looks wrong and
export the list for the utility to check.

#### Stage 3 — Design the Network

**6. Draw DMAs** — draw each area and link its main meter. If the meter file
carried DMA names, **Auto-Create DMAs** builds the polygons from the meter
positions in one step, with a small margin so meters on the edge fall inside.

**7. Mark Isolation Points** — record the valves that close each boundary.
**Find border valves** proposes them.

**8. Design Network Flow** — lay out how water moves: source, through main
meters, into each DMA. This is the model LeakZon Main uses to reason about the
network.

#### Stage 4 — Migration to LeakZon

**9. Export to LeakZon** — the final package.

The export **analyses the project first** and reports what it found: how many
meters are assigned to a DMA, how many are not, mains versus sub-meters, which
DMAs have no main meter, and how many meters lack coordinates. Only then does it
produce the files.

- Shapefiles for every layer, with DMA and boundary outlines.
- A meter workbook, English headers regardless of interface language, with a DMA
  Name column and an Is Main column.
- Meters with no DMA go to their own file rather than being mixed in.
- Any DMA without a main meter gets a placeholder so the receiving system has
  one per area.

---

## Approval and hand-over

Before exporting, the customer can be asked to approve the design. They open the
shared view, see an approve button, and confirm in their name. On approval the
project locks itself, the project page is notified, and the onboarding steps are
marked complete. Unlocking the project withdraws the approval.

---

## Accounts

| Type | Access |
| --- | --- |
| **Admin** | Everything, including user management |
| **LeakZon** | Every project |
| **Super User** | Every project |
| **Project User** | Only the projects assigned to them |

Sign-in is a 6-digit PIN. An administrator can sign in as a user — using the
user's email with their own PIN — to reproduce what that user sees; the session
is marked with a banner and recorded.
