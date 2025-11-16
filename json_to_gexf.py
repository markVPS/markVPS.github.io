#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
import networkx as nx
import re

def slugify(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9._-]+', '_', name).strip('_')[:80]

def collect_jsons(input_dir: Path):
    files = sorted(input_dir.glob("*.json"))
    data = []
    for f in files:
        try:
            with f.open("r", encoding="utf-8") as fh:
                obj = json.load(fh)
            data.append((f, obj))
        except Exception as e:
            print(f"[warn] skip {f}: {e}", file=sys.stderr)
    return data

def extract_related(rows):
    """
    Find a row whose label (case-insensitive) is 'Related aesthetics' (or singular).
    Return list of names split by comma.
    """
    for row in rows:
        label = (row.get("label") or "").strip().lower()
        if label in ("related aesthetics", "related aesthetic"):
            val = (row.get("value") or "").strip()
            # split on commas/semicolons, clean and drop empties
            parts = [p.strip() for p in re.split(r"[,;]+", val) if p.strip()]
            return parts
    return []

def main():
    ap = argparse.ArgumentParser(description="Convert per-page JSONs into a GEXF graph (+TSVs).")
    ap.add_argument("--json-dir", required=True, help="Folder with per-page JSONs (from the add-on).")
    ap.add_argument("--out-gexf", required=True, help="Output .gexf path.")
    ap.add_argument("--out-nodes-tsv", help="Optional nodes.tsv path.")
    ap.add_argument("--out-edges-tsv", help="Optional edges.tsv path.")
    args = ap.parse_args()

    in_dir = Path(args.json_dir)
    if not in_dir.is_dir():
        print(f"Input dir not found: {in_dir}", file=sys.stderr)
        sys.exit(1)

    G = nx.Graph()  # undirected; use DiGraph() if you want direction

    # Pass 1: add nodes for each page JSON
    page_title_by_id = {}
    jsons = collect_jsons(in_dir)
    for f, obj in jsons:
        page = obj.get("page", {})
        title = (page.get("title") or "").strip() or f.stem
        url = page.get("url") or ""
        groups = obj.get("groups") or []
        # take first group's image/caption if present
        image = ""
        caption = ""
        if groups:
            g0 = groups[0]
            image = (g0.get("image") or "").strip()
            caption = (g0.get("caption") or "").strip()

        node_id = title  # use title as ID to keep labels human-readable
        page_title_by_id[node_id] = title

        G.add_node(node_id, label=title, url=url, image=image, caption=caption)

    # Pass 2: add edges based on "Related aesthetics"
    # If a related name doesn't exist yet as a node, create it (dangling nodes are okay)
    for f, obj in jsons:
        page = obj.get("page", {})
        src_title = (page.get("title") or "").strip() or f.stem
        groups = obj.get("groups") or []
        # Search all groups for "Related aesthetics"
        related = []
        for g in groups:
            rows = g.get("rows") or []
            related += extract_related(rows)

        for name in related:
            # add node for the related aesthetic if unknown (no attrs)
            if not G.has_node(name):
                G.add_node(name, label=name)
            if src_title != name:
                # add or increment edge weight
                if G.has_edge(src_title, name):
                    G[src_title][name]["weight"] = G[src_title][name].get("weight", 1) + 1
                else:
                    G.add_edge(src_title, name, weight=1)

    # Write GEXF
    nx.write_gexf(G, args.out_gexf, encoding="utf-8")
    print(f"[ok] wrote GEXF: {args.out_gexf}")

    # Optional TSVs
    if args.out_nodes_tsv:
        with open(args.out_nodes_tsv, "w", encoding="utf-8") as fh:
            fh.write("id\tlabel\turl\timage\tcaption\n")
            for n, attrs in G.nodes(data=True):
                fh.write(
                    "{}\t{}\t{}\t{}\t{}\n".format(
                        n,
                        attrs.get("label",""),
                        attrs.get("url",""),
                        attrs.get("image",""),
                        attrs.get("caption",""),
                    )
                )
        print(f"[ok] wrote nodes TSV: {args.out_nodes_tsv}")

    if args.out_edges_tsv:
        with open(args.out_edges_tsv, "w", encoding="utf-8") as fh:
            fh.write("source\ttarget\tweight\n")
            for u, v, attrs in G.edges(data=True):
                fh.write(f"{u}\t{v}\t{attrs.get('weight',1)}\n")
        print(f"[ok] wrote edges TSV: {args.out_edges_tsv}")

if __name__ == "__main__":
    main()
