#!/usr/bin/env python3
"""
Simple HTTP server to run the Vending Machine Location Finder
Run this script and open http://localhost:8000 in your browser
"""

import http.server
import socketserver
import webbrowser
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"Server running at {url}")
        print("Press Ctrl+C to stop the server")
        print("\nOpening browser...")
        
        try:
            webbrowser.open(url)
        except:
            print(f"Could not open browser automatically. Please open {url} manually.")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")

if __name__ == "__main__":
    main()


