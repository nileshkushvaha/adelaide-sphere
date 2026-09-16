# Decision D01 — the Adelaide coverage boundary

Status: **open with the client** (updated 16 Sep 2026). The application currently covers **Inner Adelaide** as a working baseline. Nothing below is a client-approved boundary; items marked *to confirm with the client* are unverified or undecided.

The application has one fixed city — Adelaide, South Australia, Australia — and keeps it whatever is decided here (SRS SCP 001, UX 003, FUT 004). There is no city or country selector and none is proposed. "Local areas" are subdivisions of the approved boundary; this decision only changes which subdivisions are on the list.

## 1. The question

When a visitor, an editor or a search engine reads "Adelaide" on this site, which territory is meant? The realistic candidates are:

| Option | What it covers | Notes |
|---|---|---|
| **A. City of Adelaide** (council area) | The localities of Adelaide (the CBD, postcode 5000) and North Adelaide (5006), with the Park Lands | The SRS's conservative planning baseline (SCP 004) |
| **B. Inner Adelaide** (current working baseline) | The City of Adelaide plus the surrounding inner councils: Norwood Payneham & St Peters, Unley, Prospect, Walkerville, Burnside and West Torrens | What the seed and the site copy use today |
| **C. Greater Adelaide** | The ABS Greater Capital City Statistical Area for Adelaide (ASGS) | The widest metropolitan reading; the outer limit for any future tier |

## 2. Current baseline (implemented)

- **Research:** 108 gazetted localities in the seven Inner Adelaide councils were compiled, each with its council; localities shared with a council outside the seven are marked "part". The research record is in `docs/setup-progress.md` (15 Sep 2026, "Adelaide location model").
- **Seeded:** `BASELINE_LOCAL_AREAS` in `apps/api/src/taxonomy/seed-data.ts` holds the **16** localities in use: Adelaide, North Adelaide (City of Adelaide); Burnside (City of Burnside); Goodwood, Hyde Park, Parkside, Unley Park (City of Unley); Kent Town, Maylands, Norwood, Stepney (City of Norwood Payneham & St Peters); Mile End, Thebarton, Torrensville (City of West Torrens); Prospect (City of Prospect); Walkerville (Town of Walkerville).
- **Address rules:** postcodes must be South Australian (`5xxx`) and coordinates must fall inside South Australia; directions links and the public address line use `SA`.
- **`site/context`** describes the Inner Adelaide boundary and notes that D01 is pending.

## 3. Open points — to confirm with the client

1. Which option (A, B, C or a named list) is the approved boundary.
2. Whether the remaining researched localities (108 − 16) should be activated, and in what order.
3. **Keswick:** sources disagree on its council split; it is listed under West Torrens in the research. To confirm with the client (and against the official locality boundaries) before it is activated.
4. Postcodes were cross-checked against a secondary listing because the Australia Post site was unreachable during research. To confirm before any postcode-based warning is introduced.
5. Cleland is mostly national park and may not warrant a local area. To confirm with the client.

## 4. Treatment of localities crossing council boundaries

- A locality is approved **as a whole** or not at all. A council split is recorded in the area's *eligibility source* note for editors but never shown to visitors and never used to reject an address.
- A business is placed in **one** local area: the gazetted locality of its public address, or, for a service business with a hidden address, the approved area it nominates as its base.
- Postcodes are **advisory only**. They can cross locality and council boundaries and are never a sufficient eligibility test (SCP 004).

## 5. Future expansion

- Expansion is **always** a change to the local-area list, never to the application's city model.
- Expansion beyond Greater Adelaide (regional South Australia, another state) is out of scope for the MVP and needs a new SRS decision (FUT 004).
- New area pages are indexable only once they have editorial content and eligible listings (SEO 003); activating an area does not create a thin page.

## 6. Validation behaviour

**Today (stays until D01 is recorded):**

1. A listing can only reference a local area that exists and is active; the admin blocks publication otherwise.
2. Publication requires an editor to record that Adelaide eligibility was verified, with the source (`eligibilityVerifiedAt`, `eligibilitySource`); the API refuses to publish without it, through the UI and by direct request alike (SCP 004 acceptance).
3. Deactivating an area that active listings reference is refused (BUS 007).
4. Postcodes outside South Australia and coordinates outside the state are rejected.

**Proposed once D01 is recorded (not implemented):**

5. The address suburb typed on a listing must match the name of an active local area (case- and punctuation-insensitive), or the editor must choose "service area only". A mismatch blocks publication, so an address that merely says "Adelaide" cannot admit a business elsewhere.
6. A postcode outside the set recorded for the chosen area produces a **warning** the editor must acknowledge (not a block).
7. Every area row records its boundary source and check date so the allow-list is auditable.

## 7. Data-update procedure

1. **Decide.** The product owner records the areas to activate (`client-decisions.md`, D01).
2. **Verify the names** against the South Australian Government's official place-name and locality records, noting the check date.
3. **Enter the areas** through the admin (Directory → Local areas) or by extending `apps/api/src/taxonomy/seed-data.ts` and running `pnpm --filter api taxonomy:seed` (idempotent; never modifies an existing row).
4. **Write the introduction** before activating an area whose page should be indexable.
5. **Record** the change in `docs/requirements-traceability.md` (SCP 001–005, BUS 008) and in this file's status line.
6. **Never** delete an area with listings; deactivate and reassign instead.

## 8. Acceptance criteria for the decision

- [ ] The product owner has approved the boundary and a named list of localities.
- [ ] Keswick and any other split locality have a confirmed council and a recorded source.
- [ ] Every activated area has its check date in its eligibility source.
- [ ] An out-of-boundary listing is refused by the admin UI **and** by a direct API request.
- [ ] The traceability document and this file record the approved list, the source and the date.
