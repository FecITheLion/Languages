# Grammar2JSON Studio

Grammar2JSON Studio is a browser-based workbench for designing grammars, evaluating symbolic logic and lambda expressions, generating structured artifacts, and moving work between local files and a shared workspace. The same frontend can run with the Express development/API server or as an installable single-page PWA on PHP hosting.

This README covers the application architecture, module authoring and processing model, development, tests, and step-by-step installation options. The standalone PHP deployment is intentionally partial; consult [PWA-PHP.md](PWA-PHP.md) for its route-by-route behavior and limits.

## What the studio does

- **Grammar and parsing:** define EBNF/BNF/PEG-style rules, inspect dependencies, edit symbols, evaluate payloads, and inspect parse traces.
- **Logic and lambda calculus:** evaluate arithmetic and symbolic expressions, bind labels and callbacks, inspect evaluation traces and truth tables, and configure Cauchy sequences.
- **Code and schema generation:** export workspace grammars and schemas to supported languages, and export logic as JSON-LD in the native PHP deployment.
- **Workbench flow:** navigate focused workbenches for dialects, rules, logic, schemas, mutations, evaluation, Python/Rust/WASM, MCP, API calls, files, history, and module packages.
- **Shared files:** retain generated files and user edits as separate versions, compare changes, and resolve conflicts rather than silently overwriting edits.
- **PWA:** install the built frontend in supported browsers on HTTPS (or localhost), and use the cached application shell when offline. API calls and other network-dependent features still require connectivity.

## Architecture

```text
src/
  App.tsx                    Top-level views, navigation, shared UI state
  components/                Workbenches and reusable React views
  data/                      Default grammar, OpenAPI/DSL data, presets
  engine/                    Parsers, evaluators, exports, history, VFS,
                             module packaging and module processing
  types/                     Shared TypeScript contracts
server.ts                    Express server and full Node API
api.php                      Native PHP router/API for the standalone install
index.php                    PHP PWA entry point and SPA shell
install.php                  Safe CLI installer for the PHP deployment
public/                      PWA manifest, service worker, icons, static assets
test/ and tests/             Unit, parity, integration and deployment tests
```

The browser app is a Vite/React application. `server.ts` is the Node/Express runtime used in development and when running the full Node API. The PHP deployment is separate: the installer copies the built SPA, PHP router/API, slug controller, and generated Apache rules into an empty deployment directory. Do not point a public web root at the repository itself.

### Module Workbench and package format

The **Module Workbench** is available from the main navigation. It discovers frontend React components as named source modules, keeps editable module drafts in browser storage, and lets you add scripts, styles, page templates, and template fragments. It also imports and exports one module at a time as a ZIP.

A module ZIP has a root folder named for its module ID:

```text
logic-workbench/
  module.json
  scripts/
    index.tsx
  styles/
    module.css
  templates/
    page.html
    fragments/
      notice.html
  assets/
    icon.svg
```

`module.json` contains the ID, display name, version, kind (`workbench`, `endpoint`, or `website`), entrypoint, optional routes, and optional runtime activation conditions. Endpoint module route declarations must be origin-relative, such as `/api/orders`.

The importer validates module IDs, archive roots, file paths, manifest fields, text encoding, and size limits. ZIPs are treated as source artifacts: **imported code is not evaluated, executed, or activated automatically**. Review and trust code before adding it to a runtime build.

### Runtime processing pipeline

`src/engine/moduleProcessingEngine.ts` provides the trusted runtime hook contract. Application code registers an implementation explicitly with `ModuleProcessingEngine.register()` or `registerPackage()`. A module package's activation configuration controls when the registered implementation is considered:

```json
{
  "routes": ["/api/orders"],
  "methods": ["POST"],
  "workbenchSlugs": ["logic_calc"],
  "blockScopes": ["request-handler"],
  "callNames": ["submit"],
  "properties": {
    "scope.mode": "safe",
    "environment.authorized": true
  }
}
```

The processing context exposes the input, mutable environment, mutable scope, call descriptor, and a managed output buffer. Route, method, page, block-scope, call-name, and property conditions are matched before hooks run; pre-processors may mutate the context, and eligible conditions are checked again as those mutations occur.

1. **Pre-processing:** conditionally inject setup hooks, normalize input, modify scope/environment, and seed or clear the output buffer.
2. **Processing:** route the call through trusted registered handlers. A handler can transform the context, return a result, or call `next()` to continue the chain.
3. **After hooks:** run in reverse handler order after successful processing.
4. **Post-processing:** parse or translate the final output buffer in reverse order and return it alongside the handler result.

Imported script text is not a trusted implementation. This separation lets the studio edit and transport modules without turning a ZIP upload into arbitrary code execution. The existing PHP and Express endpoint implementations have not yet been split into independent handler folders; endpoint module packages currently describe/edit source artifacts and route contracts, not live hot-swappable server code.

## Requirements

### Development and Node server

- Node.js and npm, or Bun.
- Network access to install the package dependencies.
- For the complete grammar/logic/API functionality, run the Node/Express application.

### PHP deployment

- PHP 8.1 or later.
- Extensions `json`, `pcre`, `hash`, and `dom` for installation and routing.
- Apache with PHP, `mod_rewrite`, and `AllowOverride` enabled for the supplied `.htaccess`, or equivalent server rewrite rules.
- `pdo_sqlite` and a private state directory if persistent PHP workspace/logic updates are needed.

## Installation options

### Option 1: Run the development app

1. Clone the repository and enter its root directory.
2. Install dependencies with one package manager:

   ```sh
   npm install
   ```

   or:

   ```sh
   bun install
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

4. Open the local URL printed by the server. `npm run dev` starts the TypeScript Express/Vite development setup.
5. To run the Node server without the development command, use:

   ```sh
   npm run start
   ```

   Use a Node release that supports executing the repository's TypeScript server entry point. If your Node installation does not support that, run `npx tsx server.ts`.

### Option 2: Build and preview the production SPA

1. Install dependencies as described above.
2. Build for the URL prefix where the app will be hosted. For a domain-root deployment:

   ```sh
   npm run build -- --base=/
   ```

   For a subpath such as `/studio/`:

   ```sh
   npm run build -- --base=/studio/
   ```

3. Preview the build locally:

   ```sh
   npm run preview
   ```

4. For static hosting, publish the contents of `dist/` at the matching URL prefix. Configure unknown navigation paths to serve `index.html`; API routes need a real API server or an explicit JSON error, not the SPA fallback. Verify subpath routing, root-relative links, service-worker scope, and HTTPS with the actual host.

### Option 3: Install the PHP PWA

The PHP installer copies only `dist/` plus the PHP router/API, slug controller, and `.htaccess` rules into a new deployment directory. It does not modify an existing installation or copy the repository.

1. Build with the **exact** base path you will use. For `/studio/`:

   ```sh
   npm install
   npm run build -- --base=/studio/
   ```

2. Create an existing empty destination outside the repository and outside other web-served directories. For example:

   ```sh
   mkdir -p /var/www/empty-studio
   ```

3. Run the CLI-only installer with the canonical absolute path and same base:

   ```sh
   php install.php /var/www/empty-studio /studio/
   ```

   For a domain-root install, build with `--base=/` and pass `/` to the installer.

4. Configure the web server's document root or alias to the installed directory, **not the source repository**. Apache must permit the provided rewrite rules and execute PHP. For another server, route `/api` and `/healthz` to `index.php`, route non-file navigation to `index.php`, deny hidden files and PHP source downloads other than the intended entry point, and serve the manifest with the correct MIME type.

5. To smoke-test a local installation from its installed directory:

   ```sh
   php -S 127.0.0.1:8080 index.php
   ```

   Then visit the installed base URL in a browser. Browser PWA installation requires HTTPS, except for localhost.

6. If PHP logic/workspace persistence is needed, create a private state directory **outside every web-served path**, owned and writable by the PHP service user, with mode `0700`. Configure:

   ```text
   GRAMMAR2JSON_STATE_DIR=/absolute/private/path
   ```

   Enable `pdo_sqlite`. Without this configuration, PHP reads use the preset state and writes fail explicitly with 503; they are not silently discarded. Back up this directory because it contains the SQLite database and history.

The installer refuses nonempty or unsafe destinations, symlinks, mismatched build bases, unsafe build files, and changed installations. If it reports a partial copy after a filesystem failure, inspect the target and empty it manually before retrying. See [PWA-PHP.md](PWA-PHP.md) for details.

### Option 4: Install as a browser PWA

1. Build and deploy the SPA or PHP installation at its final HTTPS URL.
2. Visit it in a supported browser.
3. Use the browser's install control or menu when available.
4. Reopen the installed app from the browser/OS app launcher.

Installation prompts differ by browser and platform. The service worker caches the public application shell and fingerprinted assets, not API responses, credentials, or private state.

## Using the Module Workbench

1. Open **Modules** from the studio navigation.
2. Choose a discovered workbench module or select **New module**.
3. Edit the module name/version/kind and, for endpoint modules, its route declarations.
4. Add or select files under `scripts/`, `templates/`, or `styles/`. HTML files can represent a full page or a reusable template fragment.
5. Edit runtime injection conditions as JSON and choose **Apply conditions**. Supported selectors include routes, methods, workbench slugs, block scopes, call names, and exact scalar properties on `input`, `environment`, `scope`, or `call`.
6. Select **Export ZIP** to package the module under its own named folder. Use **Import ZIP** to load a module from another installation.
7. Imported code remains an editable local draft. Review, test, and explicitly register trusted runtime implementations before deploying code changes; the browser workbench does not rewrite server-side PHP/Express files.

## API and deployment boundaries

The full Node API is served by Express. The PHP API is a native subset for standalone PHP hosting; it is not a proxy to Node. In the current PHP deployment:

- Workspace, grammar, history, selected node, logic state/evaluation, Cauchy, and limited MCP logic evaluation/resource routes are implemented.
- Unicode grammar literals/classes and code-point offsets are evaluated natively.
- Logic JSON-LD export is implemented. Native logic code generation for the other targets is not yet ported.
- MCP server discovery, broad tool coverage, client exports, context updates, and cache operations are not yet ported.
- Unsupported routes return explicit JSON errors. Do not treat an HTTP success or the PWA health route as proof that an unported feature is available.

Both server implementations currently expose broad CORS behavior and do not provide a complete authentication layer. Place public deployments behind an appropriate authentication and request-control boundary. Never commit secrets, publish private state directories, or rely on client-side editor restrictions as authorization.

## Validation and tests

Run the TypeScript checks and full test suite from the repository root:

```sh
npm run lint
npm test
npm run build
php -l api.php
```

The suite includes PHP/TypeScript parity checks, module ZIP and processing-pipeline tests, PWA installer/API integration, and worker-cache checks. A Lua-specific generated-code test is skipped when Lua is not installed. The production build may report existing Vite native-config and large-chunk warnings; confirm build completion and test the actual deployment base path.

## Troubleshooting

- **Installer rejects the destination:** use an existing empty canonical absolute path outside the project. It intentionally does not overwrite.
- **Installer says build base mismatch:** rebuild with exactly the base passed to `install.php`, including the trailing slash.
- **PHP writes return 503:** enable `pdo_sqlite`, configure an existing private absolute `GRAMMAR2JSON_STATE_DIR`, and grant write access to the PHP service user.
- **A route returns the SPA instead of JSON:** configure API routes before the SPA fallback. For PHP, route `/api` and `/healthz` to `index.php`.
- **PWA installation is unavailable:** use HTTPS or localhost and ensure the manifest, icons, and service worker are reachable within the deployed base path.
- **An imported module does not run:** this is intentional. ZIP contents are inert source. Review the code and add its implementation to the trusted runtime registry/build before deployment.
- **Module drafts do not appear on another device:** browser storage is local. Export the module ZIP and import it in the other browser.
