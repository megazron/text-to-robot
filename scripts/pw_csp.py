"""Playwright's wait_for_function under the site's Content-Security-Policy.

Page.wait_for_function compiles its predicate with eval inside the page, which the site's policy (no 'unsafe-eval',
Trusted Types for scripts) blocks. install() replaces it on Page and Frame with a loop of page.evaluate calls, which
DevTools runs outside the page's policy, so the browser checks keep the real CSP on (no bypass_csp).
"""
import time
from playwright.sync_api import Error, Frame, Page, TimeoutError


def _wait(self, expression, *, arg=None, timeout=None, polling=None):
    deadline = time.monotonic() + (30000 if timeout is None else timeout) / 1000
    step = (polling / 1000) if isinstance(polling, (int, float)) else 0.1
    last = None
    while True:
        try:
            value = self.evaluate(expression, arg) if arg is not None else self.evaluate(expression)
            if value: return value
        except Error as e:   # a navigation in progress destroys the context; try again
            last = e
        if timeout != 0 and time.monotonic() > deadline:
            raise TimeoutError(f"wait_for_function timed out after {timeout} ms: {expression[:120]}" + (f" (last error: {last})" if last else ""))
        time.sleep(step)


def install():
    Page.wait_for_function = _wait
    Frame.wait_for_function = _wait
