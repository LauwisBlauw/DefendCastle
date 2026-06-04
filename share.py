#!/usr/bin/env python3
"""Serve a folder over LAN so a phone can download files via browser."""
import argparse
import http.server
import socket
import socketserver
import sys
from pathlib import Path

PORT = 8000


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def print_qr(url: str) -> None:
    try:
        import qrcode
    except ImportError:
        return
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make()
    qr.print_ascii(invert=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default=".", help="folder to share")
    parser.add_argument("-p", "--port", type=int, default=PORT)
    args = parser.parse_args()

    root = Path(args.directory).expanduser().resolve()
    if not root.is_dir():
        sys.exit(f"not a directory: {root}")

    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=str(root), **kw)

    with socketserver.ThreadingTCPServer(("0.0.0.0", args.port), handler) as httpd:
        url = f"http://{lan_ip()}:{args.port}/"
        print(f"\nServing {root}")
        print(f"On your phone (same WiFi), open: {url}\n")
        print_qr(url)
        print("Ctrl-C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped.")


if __name__ == "__main__":
    main()
