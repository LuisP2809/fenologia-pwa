#!/usr/bin/env python3
"""Convierte data/lotes-mapa.geojson de gzip-base64 a GeoJSON normal.

Es seguro ejecutarlo varias veces: si el archivo ya está normalizado, solo lo valida.
"""

from __future__ import annotations

import base64
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "data" / "lotes-mapa.geojson"


def validate_geojson(data: object) -> dict:
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise ValueError("El mapa no es una FeatureCollection GeoJSON válida.")

    features = data.get("features")
    if not isinstance(features, list):
        raise ValueError("El GeoJSON no contiene una lista de geometrías.")

    active = sum(
        1
        for feature in features
        if isinstance(feature, dict)
        and isinstance(feature.get("properties"), dict)
        and feature["properties"].get("ACTIVO") is True
    )

    if len(features) != 254:
        raise ValueError(
            f"Se esperaban 254 geometrías normalizadas y se encontraron {len(features)}."
        )
    if active != 253:
        raise ValueError(
            f"Se esperaban 253 lotes activos y se encontraron {active}."
        )

    return data


def main() -> int:
    if not MAP_PATH.exists():
        print(f"ERROR: No se encontró {MAP_PATH}", file=sys.stderr)
        return 1

    try:
        payload = json.loads(MAP_PATH.read_text(encoding="utf-8"))

        if isinstance(payload, dict) and payload.get("encoding") == "gzip-base64":
            encoded = "".join(str(payload.get("data", "")).split())
            encoded = encoded.replace("-", "+").replace("_", "/")
            encoded += "=" * ((4 - len(encoded) % 4) % 4)

            compressed = base64.b64decode(encoded)
            raw = gzip.decompress(compressed)
            geojson = validate_geojson(json.loads(raw.decode("utf-8")))

            backup = MAP_PATH.with_suffix(".geojson.comprimido.bak")
            if not backup.exists():
                backup.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            MAP_PATH.write_text(
                json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            print("Mapa normalizado correctamente.")
        else:
            geojson = validate_geojson(payload)
            print("El mapa ya estaba normalizado correctamente.")

        print(f"Archivo: {MAP_PATH}")
        print(f"Geometrías: {len(geojson['features'])}")
        print("Lotes activos: 253")
        return 0

    except Exception as error:  # noqa: BLE001
        print(f"ERROR AL NORMALIZAR EL MAPA: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
