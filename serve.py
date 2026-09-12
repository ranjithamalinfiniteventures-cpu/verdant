#!/usr/bin/env python3
"""Dev server that refuses to be cached.

Browsers keep ES modules in a per-URL module map and will happily serve a stale
src/*.js after an edit, which looks exactly like "my change did nothing".
"""
import base64, functools, http.server, os, socketserver, sys, time

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def do_POST(self):
        """Dev-only frame grab.

        The in-app browser screenshots a WebGL canvas as solid black (no
        preserveDrawingBuffer), so the page reads its own framebuffer and POSTs
        the data URL here instead of paying to pipe base64 back through the
        agent transcript. Writes into .shots/, which is dev scratch.
        """
        if self.path == '/__watch':
            # append-only timeline, so we can see WHEN the picture dies
            n = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(n).decode('utf-8', 'replace')
            os.makedirs('.shots', exist_ok=True)
            with open('.shots/watch.log', 'a') as f:
                f.write(body + '\n')
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
            return
        if self.path == '/__diag':
            """The page reporting its own runtime state.

            Needed because the failure only reproduces in a browser I cannot
            attach a debugger to. Rather than guess, the page measures itself
            and posts the answer here."""
            n = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(n).decode('utf-8', 'replace')
            os.makedirs('.shots', exist_ok=True)
            with open('.shots/diag.json', 'w') as f:
                f.write(body)
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'ok')
            return
        if self.path != '/__shot':
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode('utf-8', 'replace')
        if ',' in body:
            body = body.split(',', 1)[1]
        os.makedirs('.shots', exist_ok=True)
        name = self.headers.get('X-Shot-Name') or f'shot-{int(time.time()*1000)}'
        name = ''.join(c for c in name if c.isalnum() or c in '-_')
        ext = (self.headers.get('X-Shot-Ext') or 'jpg').lower()
        ext = ext if ext in ('jpg', 'png') else 'jpg'
        sub = self.headers.get('X-Shot-Dir') or ''
        sub = ''.join(c for c in sub if c.isalnum() or c in '-_')
        folder = os.path.join('.shots', sub) if sub else '.shots'
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name + '.' + ext)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(body))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(path.encode())

    def log_message(self, fmt, *a):
        """Access log to .shots/access.log — dev only.

        Silence was fine until a black screen made "is the browser even reaching
        this server?" the question that mattered, and there was no way to answer
        it. Logs to a file rather than stdout so it survives the server being
        started detached."""
        try:
            os.makedirs('.shots', exist_ok=True)
            with open('.shots/access.log', 'a') as f:
                f.write('%s %s - %s\n' % (time.strftime('%H:%M:%S'),
                                           self.address_string(), fmt % a))
        except Exception:
            pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), functools.partial(NoCache, directory=".")) as httpd:
    print(f"verdant dev server on http://localhost:{port}")
    httpd.serve_forever()
