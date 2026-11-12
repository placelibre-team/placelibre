#!/usr/bin/env python3
"""Build the pilot inventory from pinned, public municipal snapshots (stdlib only)."""
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    {"id": "horodateurs-2023", "title": "Horodateurs à Antibes Juan-les-Pins", "updated": "2023-02-17",
     "url": "https://www.data.gouv.fr/datasets/horodateurs-a-antibes-juan-les-pins",
     "download": "https://static.data.gouv.fr/resources/horodateurs-a-antibes/20230217-112108/antibes-emplacements-horodateurs.csv",
     "file": "data/sources/antibes-horodateurs-2023.csv"},
    {"id": "stationnement-2025", "title": "Stationnement à Antibes Juan-les-Pins", "updated": "2025-09-22",
     "url": "https://www.data.gouv.fr/datasets/stationnement-a-antibes",
     "download": "https://static.data.gouv.fr/resources/stationnement-a-antibes/20250922-075258/antibes-stationnement.csv",
     "file": "data/sources/antibes-stationnement-2025.txt"},
]

def normalize(value):
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()).strip()

# Named neighbourhood selection, not a measured radius or an exhaustive street census.
GROUPS = [
    ("bricka", "Rue Bricka", "coeur", ["bricka"]),
    ("saint-honorat", "Rue Saint-Honorat", "coeur", ["saint honorat"]),
    ("courbet", "Avenue Courbet", "alentours", ["avenue courbet"]),
    ("esterel", "Avenue de l’Estérel", "alentours", ["avenue de l esterel"]),
    ("gallet", "Avenue Louis Gallet", "alentours", ["louis gallet"]),
    ("joffre", "Avenue Maréchal Joffre", "alentours", ["marechal joffre"]),
    ("alexandre", "Alexandre III (avenue / boulevard)", "alentours", ["alexandre iii"]),
    ("guillaumont", "Boulevard Charles Guillaumont", "alentours", ["charles guillaumont"]),
    ("parkings", "Parkings voisins", "alentours", ["parking courbet", "parking esterel", "parking dulys", "parking p1 dulys"]),
]

def classify(address):
    key = normalize(address)
    return next((g[0] for g in GROUPS if any(p in key for p in g[3])), None)

def read_meters(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"LOCALISATION", "N° HORODATEUR", "PAYANT", "HORAIRES", "TYPE_STATIONNEMENT"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Horodateurs: colonnes attendues absentes")
        rows = list(reader)
    if any(None in row or any(v is None for v in row.values()) for row in rows):
        raise ValueError("Horodateurs: ligne CSV mal formée")
    records = []
    for row_number, row in enumerate(rows, 2):
        group = classify(row["LOCALISATION"])
        if not group:
            continue
        number = row["N° HORODATEUR"].strip()
        records.append({"id": "meter-" + number, "number": number, "group": group,
            "address": row["LOCALISATION"].strip(), "kind": row["TYPE_STATIONNEMENT"].strip(),
            "paidInSource": row["PAYANT"].strip(), "period": row["PERIODE"].strip(),
            "hours": row["HORAIRES"].strip().strip('"'),
            "freeHours": row["GRATUIT PAR JOUR - H"].strip(),
            "freeWeekends": row["GRATUIT SAMEDI, DIMANCHE & JOURS FERIES"].strip(),
            "sourceId": "horodateurs-2023", "sourceRow": row_number,
            "coordinates": None, "observedAt": None, "availability": None,
            "fieldVerified": False})
    ids = [r["id"] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError("Identifiant d’horodateur dupliqué")
    duplicates = Counter(normalize(r["address"]) for r in records)
    for r in records:
        r["sharedAddress"] = duplicates[normalize(r["address"])] > 1
    return records, len(rows)

def read_parking(path):
    # The published .csv is actually fixed-width text. Parse only inspected fields;
    # do not infer the joined electric-vehicle/bicycle header or ambiguous tariffs.
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    columns = {"name": (15,36,"nom"), "address": (44,73,"adresse"),
        "freeInSource": (103,113,"gratuit"), "capacity": (113,125,"nb_places"),
        "pmr": (136,150,"nb_pmr"), "longitude": (269,283,"xlong"), "latitude": (283,297,"ylat")}
    for _, (a,b,label) in columns.items():
        if lines[0][a:b].strip() != label:
            raise ValueError("Stationnement: structure fixe modifiée, vérifier avant import")
    wanted = {"Courbet", "Dulys 1", "Dulys 2", "Gare Juan-les-Pins", "Nation"}
    result = []
    for row_number, line in enumerate(lines[1:], 2):
        if not line.strip():
            continue
        if len(line) < 426:
            raise ValueError("Stationnement: ligne tronquée")
        r = {k: line[a:b].strip() for k,(a,b,_) in columns.items()}
        if r["name"] not in wanted:
            continue
        for key in ["capacity", "pmr"]:
            r[key] = int(r[key]) if r[key] else None
        # Source IDs are repeated 06004-P- placeholders. Derive stable named IDs.
        r.update(id="parking-" + normalize(r["name"]).replace(" ", "-"),
                 sourceId="stationnement-2025", sourceRow=row_number,
                 coordinates=None, availability=None, observedAt=None, fieldVerified=False)
        if r.pop("longitude") or r.pop("latitude"):
            raise ValueError("Coordonnées nouvelles : vérifier leur système avant intégration")
        result.append(r)
    if {r["name"] for r in result} != wanted or len(result) != len(wanted):
        raise ValueError("Stationnement: sélection manquante ou dupliquée")
    return result, len(lines)-1

def build():
    meters, total = read_meters(ROOT / SOURCES[0]["file"])
    parking, parking_total = read_parking(ROOT / SOURCES[1]["file"])
    sources = []
    for source, count in zip(SOURCES, [total, parking_total]):
        sources.append({**source, "sha256": hashlib.sha256((ROOT / source["file"]).read_bytes()).hexdigest(),
            "rows": count, "retrieved": "2026-11-12", "publisher": "Ville d’Antibes", "license": "Licence Ouverte 2.0",
            "attribution": "Source : Ville d’Antibes, disponible sur data.gouv.fr, mise à jour du " + source["updated"]})
    return {"schemaVersion": 1, "checkedAt": "2026-11-12", "sources": sources,
        "scope": {"title": "Bricka / Saint-Honorat et alentours", "selection": "Rues nommées du pilote et sélection d’axes / parkings voisins ; ni rayon mesuré, ni inventaire exhaustif."},
        "groups": [{"id": g[0], "name": g[1], "scope": g[2], "meterCount": sum(m["group"] == g[0] for m in meters)} for g in GROUPS],
        "meters": meters, "parkings": parking,
        "limitations": ["Inventaires statiques : aucune occupation en direct ni transaction de ticket.",
          "Aucune coordonnée GPS exploitable dans cette sélection ; adresses à localiser et à vérifier.",
          "Aucune ligne Saint-Honorat trouvée dans l’inventaire des horodateurs ; tarif inconnu, pas gratuit par déduction.",
          "Les capacités des parkings ne sont pas des places libres. Les chiffres globaux Juan-les-Pins ne sont pas affectés aux rues du pilote.",
          "Plusieurs identifiants peuvent partager une adresse : conservés séparément, à contrôler sur place."]}

if __name__ == "__main__":
    data = build()
    target = ROOT / "public/data/pilot-inventory.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(data['meters'])} horodateurs sélectionnés, {len(data['parkings'])} parkings ; {target}")
