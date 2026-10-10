import http.server, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 8095))
print(f"Serving branch-manager from {os.getcwd()} on port {port}")
http.server.HTTPServer(('', port), http.server.SimpleHTTPRequestHandler).serve_forever()
