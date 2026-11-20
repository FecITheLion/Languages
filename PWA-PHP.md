# PWA and PHP deployment

The existing Node/Vite development and Express server are unchanged. Production builds can also be installed as a PWA on HTTPS (or localhost); browser support and installation prompts vary. The manifest uses the build's URL base. The worker is registered only in production builds.

## Build and install

With the project's dependencies already available, build for the exact URL prefix (use `/` for the domain root):

```sh
npm run build -- --base=/studio/
mkdir -p /absolute/path/to/empty-web-directory
php install.php /absolute/path/to/empty-web-directory /studio/
```

The installer is CLI-only and requires PHP 8.1 or later and the JSON, PCRE and hash extensions. It checks destination writability and copies **only `dist`**, plus the PHP router, API implementation and Apache rules, into an existing empty canonical directory outside this repository. Re-running the same build and base is a no-op if every installed file still matches; changed installations are rejected without overwriting data. It refuses symlinks in the build or installed files, unsafe build filenames, noncanonical destinations, and mismatched build bases. Use a private, trusted build and destination: inspect `dist` before publishing because anything in `public/` or bundled into the build is public, including any secrets or source maps accidentally placed there. Never expose the repository, `.env`, or installer through the web server. If a copy fails partway, inspect and empty the destination before retrying; the installer does not overwrite or automatically remove existing files.

Point the web server's document root (or `/studio/` alias) at the installed directory, **not** the repository. Apache needs PHP, `mod_rewrite`, and `AllowOverride` permitting the supplied `.htaccess`; `mod_headers` is recommended for shell/worker revalidation. For other servers, send all non-file routes to `index.php`, deny hidden and executable files other than the router (especially `api.php`), serve the manifest as `application/manifest+json`, and keep `index.html` and `sw.js` revalidating. Route `/api` and `/healthz` before static files or SPA fallback. Unsupported PHP API routes return JSON 503 rather than HTML. Check the rules in your actual server configuration.

For a local PHP-only smoke test (not a production server), from the installed directory run:

```sh
php -S 127.0.0.1:8080 index.php
```

Open `http://127.0.0.1:8080/studio/`; the router also serves a deep link such as `/studio/example`. Use the same base that was built and installed. Apache/PHP configuration and HTTPS termination are deployment responsibilities.

## API and offline limits

The PHP API is **partial and stateless**:

* `GET`/`HEAD /healthz` returns the Express health payload. It does not assert availability of unported endpoints.
* `POST /api/logic/evaluate` accepts JSON or plain text using the Express input forms, including statement/labels objects, pairs, named and positional labels, and combined JSON. It evaluates arithmetic, logic, quantifiers and lambda callbacks natively and returns HAL results and traces. Omitted values use the Express initial preset; no mutable workspace is loaded.
* `POST /api/logic/cauchy` accepts a JSON configuration and evaluates recurrence sequences using those same initial labels. It supports up to eight seeds and the Express maximum of 120 iterations.
* Both evaluation routes cap request bodies at 5 MiB, logic text at 16 KiB, labels at 64, and parser/evaluation work. Unsupported syntax, some malformed expressions, ambiguous floating-point rounding, non-finite results, or inputs beyond PHP's limits return **503**, not a fabricated success. Validation errors return 400; unsupported content types return 415. These edge responses and floating-point behavior are not full Express parity. Logic links to `/api/logic` remain present for contract compatibility, but that route is not ported. All responses are `no-store`; no workspace state or secrets are persisted.

All other Express endpoints are unported, including API discovery, logic state/labels mutation and retrieval, rule/node/symbol/callback CRUD, grammar evaluation, workspace storage, histolog, language listing, exports and MCP. They return 503. For full functionality, run Node separately and reverse-proxy the API to it. Several existing clients use origin-root `/api/...` even when the SPA is under `/studio/`; configure the origin's `/api` (and `/healthz` if used) explicitly as a Node proxy or an explicit JSON error, never an SPA fallback. If you also accept `/studio/api`, configure that separately. The existing app also has some root-relative asset references, which may need web-server aliases at a subpath. No complete API parity or subpath compatibility is claimed. As with Express, API CORS allows all origins; add authentication and request limits at the reverse proxy if exposing the service publicly.

The service worker caches a public, credential-free `index.html` and fingerprinted Vite assets only; it never caches API, health, cross-origin, authenticated, non-GET, private, or `no-store` responses. Navigation is network-first and uses the last complete shell when offline. Initial HTML-referenced assets are downloaded before committing the shell; other fingerprinted assets are cached when used, so an unvisited lazy-loaded feature may not work offline. API calls, Google Drive, external fonts and other network-dependent features require connectivity. Cached build assets are pruned on shell refresh, retaining the current shell's assets. A worker update waits for existing tabs to close rather than forcing reloads; the cached shell is refreshed on online navigations. Publishing a new build therefore does not require changing the worker merely to update the shell. A successful real build, deployment-specific rewrite/proxy checks, and browser installability should be verified in the target environment.
