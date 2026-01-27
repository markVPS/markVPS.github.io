#!/usr/bin/env python3
"""
download_aesthetics_images.py

Reads an Aesthetics JSON (e.g. characters.json), downloads node images
from their remote URLs, saves them locally, and rewrites `attributes.image`
to point to the local path (Marvel-style).

- Uses attributes.image first, then attributes.image_url as fallback.
- Saves images into an output directory like: images/aesthetics/<id>.<ext>
- Leaves attributes.image_url unchanged.

Usage
-----
  # Basic: overwrite characters.json in-place and save images under images/aesthetics
  python download_aesthetics_images.py characters.json

  # Explicit output JSON and image directory:
  python download_aesthetics_images.py characters.json \
      --out-json characters.with-local-images.json \
      --images-dir public/images/aesthetics
"""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
import mimetypes
import sys

import requests


def guess_extension_from_url(url: str) -> str:
    """
    Try to guess the file extension from the URL path or content-type.
    Defaults to '.jpg' if unknown.
    """
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return suffix

    # Fallback: try content-type
    try:
        head = requests.head(url, timeout=5)
        ctype = head.headers.get("Content-Type", "").lower()
        ext = mimetypes.guess_extension(ctype) or ""
        if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
            return ext
    except Exception:
        pass

    return ".jpg"


def download_image(url: str, dest_path: Path) -> bool:
    """
    Download a single image from `url` to `dest_path`.
    Returns True if successful, False otherwise.
    """
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, timeout=15, stream=True)
        if resp.status_code != 200:
            print(f"  [ERROR] HTTP {resp.status_code} while fetching {url}")
            return False

        # Write file chunked
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(8192):
                if not chunk:
                    continue
                f.write(chunk)

        return True

    except Exception as e:
        print(f"  [ERROR] Failed to download {url}: {e}")
        return False


def process_json(
    json_path: Path,
    out_json_path: Path,
    images_dir: Path,
    local_prefix: str = "./images/aesthetics",
):
    """
    Load JSON, download node images, and rewrite attributes.image to local paths.

    images_dir: filesystem directory where images will be stored
    local_prefix: path prefix to write into JSON (as seen from the web viewer)
    """
    if not json_path.is_file():
        print(f"[FATAL] JSON file not found: {json_path}")
        sys.exit(1)

    print(f"[INFO] Reading JSON: {json_path}")
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = data.get("nodes", [])
    print(f"[INFO] Found {len(nodes)} nodes")

    # Avoid re-downloading identical URLs
    url_to_local = {}

    downloaded = 0
    skipped_no_url = 0
    skipped_existing = 0
    failed = 0

    for node in nodes:
        node_id = str(node.get("id"))
        attrs = node.get("attributes") or {}
        node["attributes"] = attrs

        # Choose URL: prefer image, then image_url
        url = attrs.get("image") or attrs.get("image_url")
        url = url.strip() if isinstance(url, str) else ""
        if not url:
            skipped_no_url += 1
            continue

        # If we've already processed this URL, reuse the same local path
        if url in url_to_local:
            attrs["image"] = url_to_local[url]
            skipped_existing += 1
            continue

        # Determine local filename (id + extension)
        ext = guess_extension_from_url(url)
        filename = f"{node_id}{ext}"
        dest_path = images_dir / filename

        # Local path for JSON (relative to web root, Marvel-style)
        local_path_for_json = f"{local_prefix}/{filename}"

        print(f"[DL] {node_id}: {url} -> {dest_path}")
        ok = download_image(url, dest_path)
        if not ok:
            failed += 1
            continue

        downloaded += 1
        url_to_local[url] = local_path_for_json
        attrs["image"] = local_path_for_json  # rewrite to local path

    print("[INFO] Download summary:")
    print(f"  Downloaded:       {downloaded}")
    print(f"  Reused existing:  {skipped_existing}")
    print(f"  No URL present:   {skipped_no_url}")
    print(f"  Failed downloads: {failed}")

    print(f"[INFO] Writing updated JSON to: {out_json_path}")
    with out_json_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Download Aesthetics node images locally.")
    parser.add_argument(
        "json",
        type=str,
        help="Path to the input JSON (e.g. characters.json)",
    )
    parser.add_argument(
        "--out-json",
        type=str,
        default=None,
        help="Path to the output JSON (default: overwrite input)",
    )
    parser.add_argument(
        "--images-dir",
        type=str,
        default="public/images/aesthetics",
        help="Directory to store downloaded images (default: public/images/aesthetics)",
    )
    parser.add_argument(
        "--local-prefix",
        type=str,
        default="./images/aesthetics",
        help="Path prefix written into JSON (as seen by the web viewer). "
             "Default: ./images/aesthetics",
    )

    args = parser.parse_args()

    json_path = Path(args.json).resolve()
    out_json_path = Path(args.out_json).resolve() if args.out_json else json_path
    images_dir = Path(args.images_dir).resolve()

    process_json(json_path, out_json_path, images_dir, local_prefix=args.local_prefix)


if __name__ == "__main__":
    main()
