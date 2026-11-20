<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
function abort_install(string $message): void {
    fwrite(STDERR, "Install failed: $message\n");
    exit(1);
}
function canonical_norm(string $path): string {
    return rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path), DIRECTORY_SEPARATOR);
}
if (PHP_VERSION_ID < 80100) abort_install('PHP 8.1 or later is required.');
foreach (['json', 'pcre', 'hash', 'dom', 'pdo_sqlite', 'mbstring'] as $extension) {
    if (!extension_loaded($extension)) abort_install('Required PHP extension is missing: ' . $extension);
}
if ($argc !== 3) abort_install('Usage: php install.php /absolute/existing/empty/directory /url-base/');
[$script, $targetArg, $base] = $argv;
if (!preg_match('~^/(?:[A-Za-z0-9_-]+/)*$~D', $base)) abort_install('Base must be / or a slash-terminated path of letters, digits, hyphens and underscores.');
$target = realpath($targetArg);
$project = realpath(__DIR__);
$dist = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'dist');
if (!$target || !is_dir($target) || $target === '/' || canonical_norm($targetArg) !== canonical_norm($target)) {
    abort_install('Target must be an existing absolute canonical directory without symlinks.');
}
$sep = DIRECTORY_SEPARATOR;
if ($target === $project || str_starts_with($target, $project . $sep) || str_starts_with($project, $target . $sep)) {
    abort_install('Target must be outside the project and not its ancestor.');
}
// Verify GRAMMAR2JSON_STATE_DIR (if configured) is strictly outside the target public webroot & project directory.
$stateEnv = getenv('GRAMMAR2JSON_STATE_DIR');
if (is_string($stateEnv) && $stateEnv !== '') {
    $resolvedState = realpath($stateEnv);
    if ($resolvedState === false || !is_dir($resolvedState) || is_link($stateEnv) || canonical_norm($stateEnv) !== canonical_norm($resolvedState)) {
        abort_install('GRAMMAR2JSON_STATE_DIR must be an existing canonical directory without symlinks.');
    }
    if ($resolvedState === $target || str_starts_with($resolvedState, $target . $sep)
        || $resolvedState === $project || str_starts_with($resolvedState, $project . $sep)) {
        abort_install('GRAMMAR2JSON_STATE_DIR must be outside both the public webroot target and the source project.');
    }
    if (PHP_OS_FAMILY !== 'Windows' && (fileperms($resolvedState) & 0077) !== 0) {
        abort_install('GRAMMAR2JSON_STATE_DIR must have private permissions (0700).');
    }
}
if (!$dist || is_link(__DIR__ . $sep . 'dist') || $dist !== $project . $sep . 'dist' || !is_dir($dist) || !is_file($dist . $sep . 'index.html')) {
    abort_install('Build a non-symlink dist directory first using Vite with the requested base.');
}
foreach (['sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'] as $required) {
    if (!is_file($dist . $sep . str_replace('/', $sep, $required))) abort_install('Build is missing ' . $required);
}
$html = file_get_contents($dist . $sep . 'index.html');
if ($html === false || !preg_match('~(?:src|href)=["\']' . preg_quote($base, '~') . 'assets/[^"\']+~', $html)) {
    abort_install('Built asset URLs do not match the requested base. Build with vite build --base=' . $base);
}

$files = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dist, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
foreach ($iterator as $item) {
    $relative = str_replace('\\', '/', substr($item->getPathname(), strlen($dist) + 1));
    if ($item->isLink() || preg_match('~(?:^|/)\.~', $relative) || (!$item->isDir() && (!$item->isFile() || preg_match('/\.(?:php\d*|phtml|phar|htaccess|env)$/i', $relative)))) {
        abort_install('Unsafe file in dist: ' . $relative);
    }
    if (in_array($relative, ['index.php', '.htaccess', 'php'], true) || str_starts_with($relative, 'php/')) {
        abort_install('Reserved installer filename in dist.');
    }
    $files[] = [$item->getPathname(), $relative, $item->isDir()];
}

$entry = file_get_contents(__DIR__ . $sep . 'index.php');
if ($entry === false || is_link(__DIR__ . $sep . 'index.php') || substr_count($entry, "const APP_BASE = '/';") !== 1) abort_install('Invalid PHP entry point.');
$api = file_get_contents(__DIR__ . $sep . 'api.php');
if ($api === false || is_link(__DIR__ . $sep . 'api.php')) abort_install('PHP API implementation is missing or is a symlink.');
$slugController = file_get_contents(__DIR__ . $sep . 'slug_controller.php');
if ($slugController === false || is_link(__DIR__ . $sep . 'slug_controller.php')) abort_install('PHP slug controller is missing or is a symlink.');

// Collect modular php/*.php and php/handlers/*.php files
$phpDir = __DIR__ . $sep . 'php';
$phpModules = [];
$collectPhpDir = function (string $dir, string $prefix) use (&$collectPhpDir, &$phpModules, $sep): void {
    if (!is_dir($dir) || is_link($dir)) return;
    foreach (scandir($dir) ?: [] as $modName) {
        if ($modName === '.' || $modName === '..') continue;
        $modPath = $dir . $sep . $modName;
        if ($modName === 'handlers' && $prefix === 'php/' && is_dir($modPath) && !is_link($modPath)) {
            $collectPhpDir($modPath, 'php/handlers/');
            continue;
        }
        if (!preg_match('/^[A-Za-z0-9_]+\.php$/D', $modName)) abort_install('Unexpected file in ' . $prefix . ': ' . $modName);
        if (is_link($modPath) || !is_file($modPath)) abort_install('Invalid PHP module: ' . $prefix . $modName);
        $modContent = file_get_contents($modPath);
        if ($modContent === false) abort_install('Cannot read PHP module: ' . $prefix . $modName);
        $phpModules[$prefix . $modName] = $modContent;
    }
};
$collectPhpDir($phpDir, 'php/');

$entry = str_replace("const APP_BASE = '/';", 'const APP_BASE = ' . var_export($base, true) . ';', $entry);
$htaccess = <<<'APACHE'
Options -Indexes
DirectoryIndex index.php
AddType application/manifest+json .webmanifest
RewriteEngine On
RewriteRule (^|/)\. - [F,L]
RewriteRule ^php(?:/|$) - [F,NC,L]
RewriteRule ^(?:api|healthz)(?:/|$) index.php [NC,L]
RewriteRule ^index\.php$ - [L]
RewriteRule \.(?:php[0-9]*|phtml|phar)$ - [F,NC,L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^nodes/([^/]+)/([^/]+)/members/([^/]+)/?$ index.php?slug=nodes/$1/$2/members/$3 [B,QSA,NC,L]
RewriteRule ^nodes/([^/]+)/([^/]+)/?$ index.php?slug=nodes/$1/$2 [B,QSA,NC,L]
RewriteRule ^members/([^/]+)/?$ index.php?slug=members/$1 [B,QSA,NC,L]
RewriteRule ^template/([^/]+)/([^/]+)/?$ index.php?template_route=$1/$2 [B,QSA,NC,L]
RewriteRule ^([a-z0-9][a-z0-9-]*)/?$ index.php?slug=$1 [QSA,NC,L]
RewriteRule ^ index.php [L]
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "same-origin"
<FilesMatch "^(index\.html|sw\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
</IfModule>
APACHE;

$coreFiles = ['index.php' => $entry, 'api.php' => $api, 'slug_controller.php' => $slugController, '.htaccess' => $htaccess] + $phpModules;

if (count(scandir($target)) !== 2) {
    $matches = true;
    foreach ($files as [$source, $relative, $directory]) {
        $destination = $target . $sep . str_replace('/', $sep, $relative);
        if (is_link($destination) || ($directory ? !is_dir($destination) :
            (!is_file($destination) || !is_readable($destination) || !is_readable($source) || hash_file('sha256', $destination) !== hash_file('sha256', $source)))) {
            $matches = false;
            break;
        }
    }
    foreach ($coreFiles as $name => $contents) {
        $destination = $target . $sep . str_replace('/', $sep, $name);
        if (is_link($destination) || !is_file($destination) || !is_readable($destination) || hash_file('sha256', $destination) !== hash('sha256', $contents)) {
            $matches = false;
            break;
        }
    }
    if (!$matches) abort_install('Target is not an unchanged installation of this build; nothing will be overwritten.');
    fwrite(STDOUT, "Already installed at $target for $base; no files changed.\n");
    exit(0);
}
if (!is_writable($target)) abort_install('Target directory is not writable.');
function write_new(string $path, string $contents): void {
    $handle = @fopen($path, 'x');
    if (!$handle) abort_install('Cannot create ' . $path . '; target may now be partially populated.');
    if (fwrite($handle, $contents) !== strlen($contents) || !fclose($handle)) abort_install('Cannot write ' . $path . '; target may now be partially populated.');
}
foreach ($files as [$source, $relative, $directory]) {
    $destination = $target . $sep . str_replace('/', $sep, $relative);
    if ($directory) {
        if (!@mkdir($destination, 0755)) abort_install('Cannot create directory ' . $destination);
    } else {
        $contents = file_get_contents($source);
        if ($contents === false) abort_install('Cannot read ' . $source);
        write_new($destination, $contents);
    }
}
if ($phpModules && !is_dir($target . $sep . 'php')) {
    if (!@mkdir($target . $sep . 'php', 0755)) abort_install('Cannot create directory ' . $target . $sep . 'php');
}
foreach (array_keys($phpModules) as $modRel) {
    $modDir = dirname($target . $sep . str_replace('/', $sep, $modRel));
    if (!is_dir($modDir) && !@mkdir($modDir, 0755, true)) abort_install('Cannot create directory ' . $modDir);
}
foreach ($coreFiles as $name => $contents) {
    write_new($target . $sep . str_replace('/', $sep, $name), $contents);
}
fwrite(STDOUT, "Installed SPA and native PHP API at $target for $base.\n");
