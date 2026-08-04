#!/usr/bin/env python3
import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = "https://www.coachvanhetjaar.nl/webapi/get_all_players/2026"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "players.csv"

CLUB_MAP = {
    "ADO Den Haag": "ADO Den Haag",
    "AZ": "AZ",
    "Ajax": "Ajax",
    "Excelsior": "Excelsior",
    "FC Groningen": "Groningen",
    "FC Twente": "Twente",
    "FC Utrecht": "Utrecht",
    "Feyenoord": "Feyenoord",
    "Fortuna Sittard": "Fortuna",
    "Go Ahead Eagles": "Go Ahead",
    "N.E.C.": "NEC",
    "PEC Zwolle": "PEC",
    "PSV": "PSV",
    "SC Cambuur": "Cambuur",
    "Sparta Rotterdam": "Sparta",
    "Telstar": "Telstar",
    "Willem II": "Willem II",
    "sc Heerenveen": "Heerenveen",
}


def fetch_players() -> list[dict[str, str | int]]:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    rows = payload.get("data")
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Coach van het Jaar returned no player rows")

    players: list[dict[str, str | int]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 13:
            raise RuntimeError(f"Unexpected player row shape: {row!r}")

        players.append(
            {
                "speler id": str(row[0]),
                "speler naam": str(row[1]).strip(),
                "positie": str(row[5]).strip(),
                "club": CLUB_MAP.get(str(row[4]).strip(), str(row[4]).strip()),
                "transferwaarde": int(row[8]),
                "actief": "true" if bool(row[12]) else "false",
            }
        )

    players.sort(key=lambda player: (str(player["club"]).lower(), str(player["positie"]).lower(), str(player["speler naam"]).lower(), int(player["speler id"])))
    return players


def write_csv(players: list[dict[str, str | int]]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        buffer,
        fieldnames=["speler id", "speler naam", "positie", "club", "transferwaarde", "actief"],
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(players)
    OUTPUT_PATH.write_text(buffer.getvalue(), encoding="utf-8", newline="")


if __name__ == "__main__":
    players = fetch_players()
    write_csv(players)
    print(f"Wrote {len(players)} Eredivisie players to {OUTPUT_PATH}")
    print(f"Unique clubs: {len({player['club'] for player in players})}")
    sys.exit(0)
