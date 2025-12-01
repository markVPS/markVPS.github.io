#!/usr/bin/env python3
import json
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

# ======================= CONFIG =========================
# Files in your data folder

# GEXF exported from Gephi with ForceAtlas2 layout
GEXF_PATH = Path("characters.gexf")

# Input JSON produced by the scraper
JSON_IN = Path("characters.json")

# Overwrite the same JSON file with new positions & sizes
JSON_OUT = Path("characters.json")

# Also write a zlib-compressed version for the web app
ENABLE_ZLIB_OUTPUT = True
ZLIB_OUT = Path("characters.json.gz")

# Correct namespaces for your GEXF
GEXF_NS = "http://gexf.net/1.3"
VIZ_NS = "http://gexf.net/1.3/viz"
# ========================================================


def load_positions_and_degrees_from_gexf(gexf_path: Path):
    """
    Return two dicts:
      positions: nodeId -> (x, y)
      degrees:   nodeId -> degree (number of incident edges)
    """
    if not gexf_path.is_file():
        raise SystemExit(f"GEXF not found: {gexf_path}")

    tree = ET.parse(gexf_path)
    root = tree.getroot()

    positions = {}
    degrees = {}

    # --- positions from viz:position ---
    for node_el in root.findall(f".//{{{GEXF_NS}}}node"):
        node_id = node_el.get("id")
        if node_id is None:
            continue

        pos_el = node_el.find(f".//{{{VIZ_NS}}}position")
        if pos_el is None:
            continue

        x = pos_el.get("x")
        y = pos_el.get("y")
        if x is None or y is None:
            continue

        try:
            positions[str(node_id)] = (float(x), float(y))
        except ValueError:
            continue

        # Ensure a degrees entry exists for every positioned node
        if str(node_id) not in degrees:
            degrees[str(node_id)] = 0

    # --- degrees from edges (undirected) ---
    for edge_el in root.findall(f".//{{{GEXF_NS}}}edge"):
        src = edge_el.get("source")
        trg = edge_el.get("target")
        if src is None or trg is None:
            continue

        src = str(src)
        trg = str(trg)

        if src not in degrees:
            degrees[src] = 0
        if trg not in degrees:
            degrees[trg] = 0

        degrees[src] += 1
        degrees[trg] += 1

    print(f"[sync_positions] Loaded positions for {len(positions)} nodes from {gexf_path}")
    print(f"[sync_positions] Computed degrees for {len(degrees)} nodes (from GEXF edges)")

    return positions, degrees


def update_json_positions_and_sizes(json_in: Path,
                                    json_out: Path,
                                    positions: dict,
                                    degrees: dict):
    """
    Update JSON nodes with:
      - x, y from GEXF
      - size = floor(degree / 5) + 1
    """
    if not json_in.is_file():
        raise SystemExit(f"JSON not found: {json_in}")

    with json_in.open("r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = data.get("nodes", [])
    updated_pos = 0
    updated_size = 0

    for n in nodes:
        node_id = str(n.get("id"))
        attrs = n.get("attributes")
        if attrs is None:
            attrs = {}
            n["attributes"] = attrs

        # Positions from GEXF
        if node_id in positions:
            x, y = positions[node_id]
            attrs["x"] = x
            attrs["y"] = y
            updated_pos += 1

        # Size from degree: same rule as background.js GEXF:
        #   size = floor(degree / 5) + 1
        deg = degrees.get(node_id, 0)
        size = (deg // 5) + 1
        attrs["size"] = float(size)
        updated_size += 1

    with json_out.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[sync_positions] Updated {updated_pos} nodes with positions from GEXF")
    print(f"[sync_positions] Updated {updated_size} nodes with size from degrees")
    print(f"[sync_positions] Wrote updated JSON to: {json_out}")

    return json_out


def write_zlib(json_path: Path, zlib_out: Path):
    raw = json_path.read_bytes()
    compressed = zlib.compress(raw, level=9)
    zlib_out.write_bytes(compressed)
    print(f"[sync_positions] Wrote zlib-compressed JSON to: {zlib_out} ({len(compressed)} bytes)")


def main():
    positions, degrees = load_positions_and_degrees_from_gexf(GEXF_PATH)
    updated_json = update_json_positions_and_sizes(JSON_IN, JSON_OUT, positions, degrees)

    if ENABLE_ZLIB_OUTPUT:
        write_zlib(updated_json, ZLIB_OUT)


if __name__ == "__main__":
    main()
