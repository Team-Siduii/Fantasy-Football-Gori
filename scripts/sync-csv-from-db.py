#!/usr/bin/env python3
"""Sync CSV from WK DB: remove deleted players, add new ones."""
import urllib.request, json, csv, io, sys

# ── Fetch WK DB players ──
print("Fetching WK DB players...")
req = urllib.request.Request('https://fantasy-football-gori.vercel.app/api/wk/players?_t=0')
resp = urllib.request.urlopen(req, timeout=30)
db_data = json.loads(resp.read())
db_players = db_data['players']
print(f"  Loaded {len(db_players)} players from WK DB")

# ── Read current CSV ──
print("Reading current CSV...")
with open('/tmp/gori/data/players-wk.csv', 'r', encoding='utf-8') as f:
    csv_content = f.read()
reader = csv.DictReader(io.StringIO(csv_content))
csv_players = list(reader)
print(f"  Loaded {len(csv_players)} players from CSV")

# ── Build name index ──
norm = lambda s: ''.join(c for c in (s or '').lower() if c.isalpha())

db_by_norm = {}
for p in db_players:
    key = norm(p['name'])
    if key in db_by_norm:
        print(f"  WARNING: duplicate DB name: {p['name']} (fid={p['fantasyplayerId']})")
    db_by_norm[key] = p

csv_by_norm = {}
for p in csv_players:
    key = norm(p['speler naam'])
    csv_by_norm[key] = p

# ── Find differences ──
db_set = set(db_by_norm.keys())
csv_set = set(csv_by_norm.keys())

removed = csv_set - db_set  # in CSV but not in DB
added = db_set - csv_set    # in DB but not in CSV
matched = csv_set & db_set

print(f"\nMatched: {len(matched)}")
print(f"Removed (CSV → delete): {len(removed)}")
if removed:
    for key in sorted(removed):
        p = csv_by_norm[key]
        print(f"  DELETE: {p['speler naam']} (id={p['speler id']}, club={p['club']})")

print(f"\nAdded (DB → add): {len(added)}")
if added:
    for key in sorted(added):
        p = db_by_norm[key]
        print(f"  ADD: {p['name']} (fid={p['fantasyplayerId']}, team={p['teamName']}, pos={p['positionNl']}, val={p['value']})")

# ── Build position mapping ──
POS_MAP = {
    'Goalkeeper': 'Keeper',
    'Defender': 'Verdediger',
    'Midfielder': 'Middenvelder',
    'Forward': 'Aanvaller',
}

# ── Build club mapping from existing CSV ──
# Use existing CSV club names where possible, fall back to teamName
club_map = {}
for p in csv_players:
    key = norm(p['club'])
    club_map[key] = p['club']

# Also build from CLUB_CODE in the codebase (but simpler: just use teamName)
# The CSV clubs use Dutch names. Let's map DB team names to known CSV clubs
# by matching through the existing CSV data
team_to_club = {}
for csv_p in csv_players:
    # For matched players, map DB teamName → CSV club
    csv_key = norm(csv_p['speler naam'])
    if csv_key in db_by_norm:
        db_team = db_by_norm[csv_key].get('teamName', '')
        team_to_club[db_team] = csv_p.get('club', db_team)

print(f"\nClub mapping ({len(team_to_club)} teams):")
for team, club in sorted(team_to_club.items()):
    print(f"  {team} → {club}")

# Check which DB teams don't have a club mapping
missing_teams = set()
for p in db_players:
    team = p.get('teamName', '')
    if team not in team_to_club:
        missing_teams.add(team)

if missing_teams:
    print(f"\n⚠️  Teams without club mapping: {missing_teams}")
    print("These will use teamName as club name.")
    for t in missing_teams:
        team_to_club[t] = t

# ── Generate new CSV ──
print(f"\nGenerating new CSV...")
new_rows = []
for p in db_players:
    fid = p['fantasyplayerId']
    name = p['name']
    pos_en = p.get('position', '')
    pos_nl = p.get('positionNl', '') or POS_MAP.get(pos_en, pos_en)
    team = p.get('teamName', '')
    club = team_to_club.get(team, team)
    value = p.get('value', 0)
    new_rows.append([str(fid), name, pos_nl, club, str(value)])

# Sort by ID
new_rows.sort(key=lambda r: int(r[0]))

new_csv = "speler id,speler naam,positie,club,transferwaarde\n"
for row in new_rows:
    new_csv += ",".join(row) + "\n"

with open('/tmp/gori/data/players-wk.csv', 'w', encoding='utf-8') as f:
    f.write(new_csv)

print(f"  Written {len(new_rows)} players")
print("Done!")
