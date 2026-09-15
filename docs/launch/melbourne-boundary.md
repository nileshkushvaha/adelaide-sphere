# Decision D01 — the Melbourne boundary: recommendation for approval

Status: **pending client approval** (2026-09-07). Until it is recorded, the application keeps the SRS's conservative baseline: the City of Melbourne council area, expressed as 14 local areas. Nothing in this document has been activated.

The application has one fixed city — Melbourne, Victoria, Australia — and keeps it under every option below (SRS SCP 001, UX 003, FUT 004). There is no city or country selector and none is proposed. "Local areas" are subdivisions of the approved boundary, and the only thing this decision changes is which subdivisions are on the list.

## 1. The question

When a visitor, an editor or a search engine reads "Melbourne" on this site, which territory is meant? Three candidates were evaluated:

| Option | Definition | Authoritative source | Approximate size |
| --- | --- | --- | --- |
| **A. City of Melbourne** (council area) | The local-government area administered by the City of Melbourne: the CBD, Docklands, Southbank, Carlton, Parkville, North and West Melbourne, Kensington, East Melbourne and parts of five neighbouring suburbs | Vicmap Admin LGA boundary (Victorian Government, DataVic); the council's own boundary map | ~37 km², ~150,000 residents, 1 of 31 metropolitan councils |
| **B. Greater Melbourne** (official statistical area) | The Australian Bureau of Statistics' *Greater Capital City Statistical Area* for Melbourne (ASGS Edition 3, 2021, code 2GMEL), which is what "Melbourne's population" means in official statistics | ABS Australian Statistical Geography Standard, Edition 3 (2021) | ~10,000 km², ~5 million residents, 31 councils plus parts of others, from Werribee to Pakenham and from Sunbury to the Mornington Peninsula |
| **C. Curated suburb allow-list** | A reviewed list of gazetted localities (suburbs) approved one by one, each with a source and a date, bounded by option B so it can never extend beyond Greater Melbourne | Vicmap Admin *locality* boundaries and the VICNAMES register (Geographic Names Victoria) for the list; ABS Greater Melbourne as the outer limit | Whatever is approved; starts at option A |

## 2. Recommendation

**Adopt option C — a curated allow-list of gazetted suburbs, bounded by Greater Melbourne, activated in tiers — with option A as the already-approved first tier.**

Why this fits best:

- **It matches the SRS.** SCP 004 asks for "a client approved boundary *and* local area allowlist" and calls the council area the *conservative planning baseline*, not the target. BUS 008 defines local areas as an allow-listed, individually verified set. Option C is literally that mechanism; options A and B are just two possible contents for it.
- **It matches the existing data.** The 14 seeded areas are already suburbs, not statistical zones, and four of them (Carlton North, Flemington, Port Melbourne, South Yarra) straddle the council boundary. The current data therefore already treats the *suburb* as the unit and the council line as advisory. Option A taken literally would require splitting those four suburbs; nobody looks for a business in "the City of Melbourne part of South Yarra".
- **It matches what the client and visitors mean.** The client's brief and the homepage copy speak of "the CBD and the suburbs around it". A directory that cannot list Fitzroy, St Kilda, Richmond or Footscray would surprise every Melburnian. Equally, a directory that lists Pakenham and Sunbury on day one dilutes the "one city, done properly" position and multiplies verification work before the editorial team exists. Tiers let the client set the pace.
- **It keeps the safety properties.** The unit stays the gazetted suburb, verified individually with a recorded source, so the SCP 004 rule — never publish because the address merely *says* "Melbourne" — is unchanged. Greater Melbourne as the outer bound means no tier can ever admit Geelong or Ballarat.

Option B alone is *not* recommended for launch: it turns the allow-list into "everything", removes the editorial judgement the SRS relies on, and creates ~300 area pages that would mostly be empty (SEO 003 forbids thin generated location pages). Option A alone is too narrow to be the product the client described, and it is not how the seeded data already behaves.

## 3. Proposed boundary definition (for approval)

> Melbourne Sphere lists businesses located in, or serving, an **approved local area**. A local area is a gazetted Victorian locality (suburb) listed in the Victorian Government's Vicmap Admin locality layer and the VICNAMES register, lying wholly or partly within the ABS *Greater Melbourne* Greater Capital City Statistical Area (ASGS Edition 3). Local areas are approved individually by the product owner, in tiers, and recorded with their source and approval date. A suburb that crosses a council boundary is approved as a whole. No area outside Greater Melbourne can be approved without a new SRS decision.

## 4. Initial permitted locality list

### Tier 1 — active now (the SRS baseline; 14 areas, already seeded and verified)

Melbourne CBD (the gazetted locality "Melbourne", 3000), Carlton, Carlton North\*, Docklands, East Melbourne, Flemington\*, Kensington, North Melbourne, Parkville, Port Melbourne\*, Southbank, South Wharf, South Yarra\*, West Melbourne.

\* Partly outside the City of Melbourne council area. Under option C these are approved as whole suburbs, which is how they are already used; under a literal option A they would need to be restricted or removed. **The client should confirm the whole-suburb reading** (recommended).

### Tier 2 — proposed next: the inner-metropolitan councils (draft, not activated)

The councils that share a border with the City of Melbourne or lie within roughly 10 km of the CBD. The suburb names below were drafted from general knowledge of Victorian localities and **must be checked against the Vicmap Admin locality layer before any row is created**; the check is part of the data-update procedure in §8. Suburbs marked "part" are split between councils and would be approved whole.

| Council | Draft suburbs |
| --- | --- |
| Yarra | Abbotsford, Alphington (part), Burnley, Clifton Hill, Collingwood, Cremorne, Fairfield (part), Fitzroy, Fitzroy North, Princes Hill, Richmond |
| Port Phillip | Albert Park, Balaclava, Elwood, Middle Park, Ripponlea, South Melbourne, St Kilda, St Kilda East (part), St Kilda West, Windsor (part) |
| Stonnington | Armadale, Glen Iris (part), Kooyong, Malvern, Malvern East, Prahran, Toorak |
| Merri-bek | Brunswick, Brunswick East, Brunswick West, Coburg, Coburg North, Fawkner, Glenroy, Gowanbrae, Hadfield, Oak Park, Pascoe Vale, Pascoe Vale South |
| Darebin | Bundoora (part), Kingsbury, Macleod (part), Northcote, Preston, Reservoir, Thornbury |
| Moonee Valley | Aberfeldie, Airport West, Ascot Vale, Avondale Heights, Essendon, Essendon North, Essendon West, Keilor East, Moonee Ponds, Niddrie, Strathmore, Strathmore Heights, Travancore |
| Maribyrnong | Braybrook, Footscray, Kingsville, Maidstone, Maribyrnong, Seddon, Tottenham, West Footscray, Yarraville |
| Boroondara | Ashburton, Balwyn, Balwyn North, Camberwell, Canterbury, Deepdene, Hawthorn, Hawthorn East, Kew, Kew East, Mont Albert (part), Surrey Hills (part) |
| Glen Eira | Bentleigh, Bentleigh East, Carnegie, Caulfield, Caulfield East, Caulfield North, Caulfield South, Elsternwick, Gardenvale (part), Glen Huntly, McKinnon, Murrumbeena, Ormond |
| Bayside | Beaumaris, Black Rock, Brighton, Brighton East, Cheltenham (part), Hampton, Hampton East, Highett (part), Sandringham |
| Hobsons Bay | Altona, Altona Meadows, Altona North, Brooklyn, Laverton (part), Newport, Seabrook, Seaholme, South Kingsville, Spotswood, Williamstown, Williamstown North |

### Tier 3 — the rest of Greater Melbourne (by council, on request)

Banyule, Brimbank, Cardinia, Casey, Frankston, Greater Dandenong, Hume, Kingston, Knox, Manningham, Maroondah, Melton, Monash, Mornington Peninsula, Nillumbik, Whitehorse, Whittlesea, Wyndham, Yarra Ranges (part). Activated council by council when the client asks and the editorial team can verify listings there.

The client may approve Tier 2 in full, in part (a subset of councils), or defer it. Only the tiers approved in writing are activated.

## 5. Treatment of suburbs crossing municipal boundaries

- A suburb is approved **as a whole** or not at all. The council split is recorded in the area's *eligibility source* note for editors ("Vicmap locality; split Yarra / Melbourne") but never shown to visitors and never used to reject an address.
- A business is placed in **one** local area: the gazetted locality of its public address, or, for a service business with a hidden address, the approved area it nominates as its base.
- When a locality name is reused elsewhere in Victoria (for example there is a Richmond in the north-east and a Richmond in Melbourne), the allow-list entry is the metropolitan one only; the editor's eligibility check must confirm the postcode and council match.
- Postcodes are **advisory only**. They cross suburb and council boundaries in Melbourne (3000/3004/3006/3008 alone cover four Tier 1 areas) and are never a sufficient eligibility test (SCP 004).

## 6. Validation behaviour

**Today (unchanged, and it stays until D01 is recorded):**

1. A listing can only reference a local area that exists and is active; the admin blocks publication otherwise ("Local area must be active").
2. Publication requires an editor to record that Melbourne eligibility was verified, with the source (`eligibilityVerifiedAt`, `eligibilitySource`); the API refuses to publish without it, through the UI and by direct request alike (SCP 004 acceptance).
3. Deactivating an area that active listings reference is refused (BUS 007); listings must be reassigned first.
4. Related listings never pull in an out-of-boundary business (BUS 005) because every published business already sits in an approved area.

**Proposed once D01 is recorded (small, reviewed change; not implemented yet):**

5. The address suburb typed on a listing must match the name of an active local area (case- and punctuation-insensitive), or the editor must choose "service area only". A mismatch blocks publication with a message naming both values, so "Melbourne" typed into an address for a business in Werribee cannot slip through.
6. A postcode outside the set recorded for the chosen area produces a **warning** the editor must acknowledge in the eligibility note (not a block, because postcodes cross boundaries).
7. Every area row carries `boundaryTier` (1, 2, 3) and `boundarySource` ("Vicmap Admin locality, checked YYYY-MM-DD") so the allow-list is auditable against its source.

## 7. Future expansion approach

- Expansion is **always** a change to the local-area list, never to the application's city model. Adding Tier 2 or a Tier 3 council is a data change through the procedure in §8.
- Expansion beyond Greater Melbourne (Geelong, regional Victoria, another state) is out of scope for the MVP and requires a new SRS decision (FUT 004). The stable business identifiers and the isolated location-validation module mean such a change would be a migration project, not a rewrite, but it is not something the allow-list can do by accident.
- New area pages are indexable only once they have editorial content and eligible listings (SEO 003); activating an area does not create a thin page.

## 8. Data-update procedure

1. **Decide.** The product owner records the tier or council to activate (email or a note in `client-decisions.md`, D01).
2. **Verify the names.** An editor or engineer checks each suburb against the Vicmap Admin locality layer (DataVic) or the VICNAMES register and notes the check date. Names are entered exactly as gazetted; postcodes are noted for the warning rule.
3. **Enter the areas.** Either through the admin (Directory → Local areas: name, slug, editorial introduction, eligibility source, active) or, for a whole tier, by extending the reviewed seed file (`apps/api/src/taxonomy/seed-data.ts`) and running `pnpm --filter api taxonomy:seed`, which is idempotent and never modifies an existing row.
4. **Editorial introduction.** Write the short introduction for each area before activating it if the area page should be indexable; otherwise it stays `noindex, follow` until it has content.
5. **Record.** Update `docs/requirements-traceability.md` (SCP 001–005, BUS 008) with the tier and the source, and this document's status line.
6. **Never** delete an area with listings; deactivate and reassign instead (the API refuses the delete).

## 9. Acceptance criteria for the decision

- [ ] The product owner has approved §3 (definition), the whole-suburb reading of the four split Tier 1 areas, and a named set of tiers or councils.
- [ ] Every activated area exists in Vicmap Admin / VICNAMES with the check date recorded in its eligibility source.
- [ ] No activated area lies outside ABS Greater Melbourne.
- [ ] An out-of-boundary listing is refused by the admin UI **and** by a direct API request (SCP 004 acceptance; covered today by the integration tests for the eligibility gate and extended for rule 5 when it is implemented).
- [ ] Area pages for newly activated areas are `noindex` until they carry editorial content and at least one published listing (SEO 003).
- [ ] The traceability document and this file record the approved tiers, the source and the date.
