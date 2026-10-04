#!/usr/bin/env python3
"""Fetch the 32 pinned, original Riddell helmet PNGs once; never hotlink at runtime.

Run with --verify to check the local files offline. No image processing, new API,
credentials, or scraping is involved: exact public asset URLs are in sources.json.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "logos" / "nfl"
MANIFEST = ASSETS / "sources.json"
EXPECTED = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
    "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE",
    "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
}


def inspect_png(blob):
    if blob[:8] != b"\x89PNG\r\n\x1a\n" or blob[12:16] != b"IHDR":
        raise ValueError("Response is not an original PNG")
    width, height = struct.unpack(">II", blob[16:24])
    if min(width, height) < 500 or len(blob) < 10000:
        raise ValueError("Helmet asset is missing or is not high resolution")
    if len(blob) > 10 * 1024 * 1024:
        raise ValueError("Unexpectedly large helmet asset")
    if blob[25] != 6:
        raise ValueError("Helmet PNG must preserve its original RGBA transparency")
    offset = 8
    complete = False
    while offset + 12 <= len(blob):
        length = struct.unpack(">I", blob[offset:offset + 4])[0]
        end = offset + length + 12
        if end > len(blob):
            raise ValueError("Truncated PNG chunk")
        chunk = blob[offset + 4:end - 4]
        crc = struct.unpack(">I", blob[end - 4:end])[0]
        if zlib.crc32(chunk) & 0xffffffff != crc:
            raise ValueError("Corrupt PNG chunk")
        offset = end
        if chunk[:4] == b"IEND":
            complete = offset == len(blob)
            break
    if not complete:
        raise ValueError("Incomplete PNG image")
    return {"width": width, "height": height, "bytes": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Validate all local PNGs without network calls")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    teams = manifest["teams"]
    if set(teams) != EXPECTED:
        raise ValueError("The manifest must contain exactly the 32 NFL teams")

    def fetch(item):
        abbr, source = item
        if source["file"] != f"{abbr}.png" or not source["imageUrl"].startswith("https://www.riddell.com/medias/"):
            raise ValueError(f"Unrecognized pinned asset for {abbr}")
        destination = ASSETS / source["file"]
        if args.verify or destination.exists():
            blob = destination.read_bytes()
        else:
            # curl uses the host trust store. HTTP errors and redirects outside
            # HTTPS fail, and the bounded request never prints image bytes.
            result = subprocess.run([
                "curl", "--fail", "--location", "--silent", "--show-error",
                "--proto", "=https", "--proto-redir", "=https", "--max-time", "45",
                "--max-filesize", str(10 * 1024 * 1024), source["imageUrl"],
            ], check=True, capture_output=True)
            blob = result.stdout
        observed = inspect_png(blob)
        for key in ("width", "height", "bytes", "sha256"):
            if key in source and source[key] != observed[key]:
                raise ValueError(f"Pinned {key} mismatch for {abbr}; review the source manually")
        if not args.verify and not destination.exists():
            with tempfile.NamedTemporaryFile(dir=ASSETS, delete=False) as tmp:
                tmp.write(blob)
                temp_path = Path(tmp.name)
            temp_path.replace(destination)
        return abbr, observed

    with ThreadPoolExecutor(max_workers=4) as pool:
        observations = dict(pool.map(fetch, sorted(teams.items())))
    if not args.verify:
        for abbr, observed in observations.items():
            teams[abbr].update(observed)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(value["bytes"] for value in observations.values())
    print(f"PASS: 32 original high-resolution helmet PNGs; {total:,} bytes; local hashes verified")


if __name__ == "__main__":
    main()
