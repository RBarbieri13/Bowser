# Bowser waiver import — 2026 Week 2

Public publisher facts were fetched on September 15, 2026. The exact capture time, publication/modification dates, source URLs and HTML SHA-256 fingerprints are in `data/waivers-2026-week2.json`. The importer keeps only player identities, numeric ranking/bid facts and provenance. Publisher article prose and full HTML are not included in the repository.

## Verified coverage

| Independent source | Positional rank cells | FAAB cells | Meaning |
| --- | ---: | ---: | --- |
| FantasyPros | 5 | 31 | Public top-five PPR overall preview, normalized within position; separate editorial dollar bids with a $100 reference |
| RotoBaller | 85 | 29 | Published numeric overall list, normalized within position; base FAAB range with aggressive/desperation alternatives |
| Footballguys | 0 | 6 | Public dated feature; percentages of annual budget |
| RotoWire | 0 | 14 | Public article; percentages of unspecified budget, shallow/deep tiers |
| CBS Sports | 43 | 40 | Explicit “Add in this order” positional priority cards; remaining-budget bids |
| DraftSharks | 15 | 15 | Explicit priority by position; primary section followed by deep options |
| NFL | 15 | 0 | Explicit numeric waiver priority table, normalized within position |

**PASS: 5 actual rank sources, 6 actual FAAB sources; 163 ranking cells and 135 bid cells across 101 rows.** Ninety-two players map to GSIS via unique, normalized official nflverse name variants and position. Nine team-defense rows use stable team IDs without inventing GSIS identities. Source names such as Christopher Brooks match Chris Brooks through the dictionary's official first-name fields, not fuzzy matching.

## Interpretation boundaries

- These are cross-league research inputs. No particular league membership, roster availability, scoring or waiver budget is assumed.
- All source rankings stored in player cells have `scope: position`. For a published overall table, `overallRank` preserves the original number and `method` explains the derived within-position ordinal. Article heading order alone is never accepted without an explicit publisher priority statement.
- FantasyPros coverage is the publicly exposed five-row preview. Its within-position values describe that preview, not an unavailable complete positional list. No paid cells, private endpoints or credentials were used.
- Primary FAAB values remain at `faab[sourceId].low/high`. Optional `alternatives` retain each publisher's additional named bidding tiers. Dollar amounts remain dollars with `referenceBudget: 100`.
- “At least” is an open upper range (`high: null`, `operator: at-least`). “Up to” retains `operator: at-most`, an upper limit and a zero mathematical lower bound; zero is not presented as a recommended point bid.
- Footballguys annual and CBS remaining-budget recommendations are different denominators. Other publishers do not establish starting versus remaining budget, so they stay `unspecified`. Converting all of these into a common consensus percentage without further assumptions would be misleading.
- CBS backup-QB recommendations for Carson Wentz, Michael Penix Jr. and Drew Lock, and RotoWire's Drew Lock recommendation, are excluded from the generic FAAB column because their paragraphs explicitly discuss differing superflex/two-QB treatment. Their eligible CBS waiver priorities remain in the ranking column.
- RotoBaller's positional eligibility and league-size recommendations vary; its overall table groups QBs/DST after skill players. The original overall values remain available, but no cross-position consensus is manufactured.
- Live publisher content had changed since the earlier source catalog: FantasyPros now places Kaelon Black at overall 3 in the public preview; DraftSharks has Emmett Johnson ahead of Black. The fresh capture takes precedence.
- DraftSharks' visible time omitted a zone. Its structured metadata resolves the update to `2026-09-15T20:52:59+00:00`, before this capture.
- Faabtastic is not ingested. No FTN, Yahoo index-only, model-generated or paid-preview facts are substituted for unavailable source coverage.

## Reproduction and checks

From the Bowser repository:

```sh
python3 scripts/import_waivers.py
python3 scripts/import_waivers.py --verify
python3 -m unittest discover -s tests -p 'test_waiver_import.py' -v
```

The first command performs a fresh public fetch and atomically replaces the snapshot only after every required parser and semantic validation passes. All source fetches have a 30-second timeout; no retry loop or paywall bypass is used. The second command is read-only and offline. The FantasyPros rolling dateline is pinned to September 15 for this specific Week 2 importer, so later rolling data causes a failure instead of silently relabeling another edition.

For a preexisting capture, supply `--html-dir /path/to/html --captured-at ORIGINAL_ISO_TIMESTAMP`; it must contain the public `<source>0.html`/`<source>1.html` files corresponding to the script's URL map. Old HTML must never receive a fresh capture timestamp.

Twelve regression tests cover real-source numerical spot checks, tiers and budget bases, missing versus true zero, upper/lower bounds, explicit-ranking prerequisites, original overall ranks, wrong scope/year/date, actual source coverage, malformed values, official identity variants, script-payload exclusion and atomic preservation of the prior good snapshot on failure. All pass. Integrated application `npm run check` remains the parent implementation's release gate.

Suggested package scripts: `data:waivers`, `verify:waivers`, `test:waivers` using the three commands above. This importer introduces no Python package dependencies and never changes the immutable statistics warehouse.
