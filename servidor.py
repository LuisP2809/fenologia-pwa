#!/usr/bin/env python3
"""Servidor local de Fenología para Codespaces.

Antes de iniciar, normaliza y valida el GeoJSON del mapa.
Uso: python3 servidor.py 8020
"""

from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from scripts.normalizar_mapa import main as normalizar_mapa

ROOT = Path(__file__).resolve().parent


def run() -> int:
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8020
    except ValueError:
        print("El puerto debe ser un número entero.", file=sys.stderr)
        return 1

    os.chdir(ROOT)

    if normalizar_mapa() != 0:
        print("No se inició el servidor porque el mapa no superó la validación.", file=sys.stderr)
        return 1

    server = ThreadingHTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
    print(f"Fenología disponible en el puerto {port}.")
    print("Mantén esta terminal abierta. Presiona Ctrl+C para detener el servidor.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(run())
