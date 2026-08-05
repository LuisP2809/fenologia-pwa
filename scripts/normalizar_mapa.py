#!/usr/bin/env python3
"""Convierte y valida el mapa de Fenología.

Si la cadena gzip-base64 contiene exactamente un carácter adicional, prueba cada
posición y acepta únicamente la variante que produce el GeoJSON esperado.
Es seguro ejecutarlo varias veces.
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


def decode_candidate(value: str) -> dict | None:
    """Decodifica una variante y devuelve el GeoJSON solo si supera toda validación."""
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    try:
        compressed = base64.b64decode(padded, validate=True)
        if not compressed.startswith(b"\x1f\x8b"):
            return None
        raw = gzip.decompress(compressed)
        return validate_geojson(json.loads(raw.decode("utf-8")))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, gzip.BadGzipFile):
        return None
    except Exception:
        return None


def decode_or_repair(encoded: str) -> tuple[dict, str]:
    clean = "".join(encoded.split()).replace("-", "+").replace("_", "/").rstrip("=")

    direct = decode_candidate(clean)
    if direct is not None:
        return direct, "La cadena comprimida era válida."

    if len(clean) % 4 != 1:
        raise ValueError(
            "La cadena Base64 está dañada y no coincide con el caso reparable de un carácter adicional."
        )

    print(
        f"Base64 con {len(clean)} caracteres: buscando automáticamente el carácter adicional…"
    )

    # La corrupción más común ocurre cerca del final; se revisa desde allí primero.
    for attempt, index in enumerate(range(len(clean) - 1, -1, -1), start=1):
        candidate = clean[:index] + clean[index + 1 :]
        geojson = decode_candidate(candidate)
        if geojson is not None:
            removed = clean[index]
            return (
                geojson,
                f"Cadena reparada: se retiró un carácter adicional en la posición {index + 1} ({removed!r}).",
            )
        if attempt % 2500 == 0:
            print(f"  Revisadas {attempt:,} de {len(clean):,} posiciones…")

    raise ValueError(
        "No se pudo reconstruir el mapa retirando un solo carácter. Se necesita volver a cargar el GeoJSON original."
    )


def main() -> int:
    if not MAP_PATH.exists():
        print(f"ERROR: No se encontró {MAP_PATH}", file=sys.stderr)
        return 1

    try:
        payload = json.loads(MAP_PATH.read_text(encoding="utf-8"))

        if isinstance(payload, dict) and payload.get("encoding") == "gzip-base64":
            geojson, repair_message = decode_or_repair(str(payload.get("data", "")))

            backup = MAP_PATH.with_suffix(".geojson.comprimido.bak")
            if not backup.exists():
                backup.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            MAP_PATH.write_text(
                json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            print(repair_message)
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
