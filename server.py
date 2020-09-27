import http.server
import os
import urllib.request
import contextlib
import socket
import sys
import webbrowser


class DualStackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        # suppress exception when protocol is IPv4
        with contextlib.suppress(Exception):
            self.socket.setsockopt(
                socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server, directory=os.getcwd())

    def __do_query(self):
        if self.path.startswith('/query/'):
            path = self.translate_path(self.path)
            if not os.path.exists(path):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                query = self.path[7:]
                url = f'https://conan.bintray.com/v1/conans/search?q={query}'
                print(path, '::', query, '::', url)
                web = urllib.request.urlopen(url)
                data = web.read()
                with open(path, 'wb') as f:
                    f.write(data)

    def do_GET(self):
        self.__do_query()
        super().do_GET()

    def do_HEAD(self):
        self.__do_query()
        super().do_HEAD()


def _get_best_family(*address):
    infos = socket.getaddrinfo(
        *address,
        type=socket.SOCK_STREAM,
        flags=socket.AI_PASSIVE,
    )
    family, _, _, _, sockaddr = next(iter(infos))
    return family, sockaddr


DualStackServer.address_family, addr = _get_best_family(None, 8000)

Handler.protocol_version = "HTTP/1.1"
with DualStackServer(addr, Handler) as httpd:
    host, port = httpd.socket.getsockname()[:2]
    url_host = f'[{host}]' if ':' in host else host
    print(
        f"Serving HTTP on {host} port {port} "
        f"(http://{url_host}:{port}/app/) ..."
    )
    # webbrowser.open_new(f"http://localhost:{port}/app/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKeyboard interrupt received, exiting.")
        sys.exit(0)
