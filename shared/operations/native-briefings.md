# Native private briefing delivery

Bowser `#/briefings` renders both private report types using its shared shell, player cards, league filters, full source list, and research tables. Private reports are local files opened into memory, not public hosted data. Reopen the file after a full page reload.

Create a pack from verified fresh report inputs outside the repository:

```sh
python3 scripts/build_briefing_pack.py --waiver /private/edition.json --daily /private/input.json --warehouse data/fantasy_football_2026.sqlite --output /private/bowser-briefings.json
```

Either report argument can be omitted. Output uses exclusive creation and mode 0600. Keep original private editions immutable. The converter preserves all waiver sections, all daily starting slots and alternatives, source dates and links. The warehouse is opened read-only solely to resolve unique player identities. Unmatched or ambiguous identities remain plain text. Defense comparisons link to the existing team page.

On the native page choose **Open report file**. No upload occurs: the file is read locally into React state and retained only across in-app navigation. Clear private reports or reload removes it. Do not use browser storage, public asset directories, server endpoints or logs for the pack. Existing read-only public player-profile API calls are unchanged.

Retain PDF rendering and source/arithmetic verification as archival regression checks. Browser delivery must additionally verify full section/slot/option counts, date separation, league filters, search, sorting/resizing, source links, profile links and memory-only handling. A newer waiver plan is shown as a companion to the daily report without changing the daily capture date.
