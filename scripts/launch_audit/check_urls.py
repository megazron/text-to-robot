import concurrent.futures as cf, sys, urllib.request, ssl
urls = [u.strip() for u in open(sys.argv[1]) if u.strip()]
ctx = ssl.create_default_context()
def get(u):
    for method in ("HEAD", "GET"):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, method=method, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36", "Accept": "text/html"}), timeout=20, context=ctx)
            return u, r.status, r.geturl()
        except urllib.error.HTTPError as e:
            if method == "GET": return u, e.code, ""
        except Exception as e:
            if method == "GET": return u, type(e).__name__, ""
with cf.ThreadPoolExecutor(8) as ex:
    for u, st, final in ex.map(get, urls): print(st, u, "" if not final or final == u else "-> " + final)
