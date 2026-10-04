# NFL helmet assets

These 32 transparent PNGs are original catalogue images from Riddell's official
NFL **Axiom Authentic** products, captured October 4, 2026. They depict each team's
primary helmet, including the current Washington Commanders and New York Jets
marks. They are not generated approximations, ESPN flat team marks, alternate
uniform forecasts, or assertions that every player wears this helmet model.

Each file is the manufacturer's unedited **515 × 515** original, over 18 times
the GameSelector's 28px display size. The corresponding 1200px original URL is
preserved in `sources.json`; serving the 515px original avoids shipping 43.9 MB
of oversized assets for these small icons. No image was recolored, rescaled,
cropped, or synthesized during import.

`sources.json` records the product page, exact downloaded image URL, original
1200px URL, dimensions, byte count, and SHA-256 for every file. Team marks and
product imagery remain the property of their respective owners; this manifest
does not assert a new license or transfer of rights.

The original design manifest's abbreviation list is preserved. In particular,
Washington is `WAS.png` (original ESPN slug `wsh`), the Rams are `LAR.png`, and
Jacksonville is `JAX.png`. The renderer maps `LA → LAR`, `WSH → WAS`, and
`JAC → JAX`; no duplicate downloads are required.

From the repository root:

```sh
python3 scripts/download_nfl_helmets.py --verify
python3 scripts/download_nfl_helmets.py
```

The first command is offline verification. The second fetches only missing
files from pinned HTTPS URLs, validates their original PNG bytes against the
manifest, and serves them locally thereafter. Existing mismatched files fail
validation instead of being silently overwritten. Runtime browsers never
contact Riddell or ESPN for these helmets.
