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
if (PHP_VERSION_ID < 80100) abort_install('PHP 8.1 or later is required.');
foreach (['json', 'pcre', 'hash'] as $extension) {
    if (!extension_loaded($extension)) abort_install('Required PHP extension is missing: ' . $extension);
}
if ($argc !== 3) abort_install('Usage: php install.php /absolute/existing/empty/directory /url-base/');
[$script, $targetArg, $base] = $argv;
if (!preg_match('~^/(?:[A-Za-z0-9_-]+/)*$~D', $base)) abort_install('Base must be / or a slash-terminated path of letters, digits, hyphens and underscores.');
$target = realpath($targetArg);
$project = realpath(__DIR__);
$dist = realpath(__DIR__ . '/dist');
if (!$target || !is_dir($target) || $target === '/' || rtrim($targetArg, '/') !== $target) abort_install('Target must be an existing absolute canonical directory without symlinks.');
if ($target === $project || str_starts_with($target, $project . '/') || str_starts_with($project, $target . '/')) abort_install('Target must be outside the project and not its ancestor.');
if (!$dist || is_link(__DIR__ . '/dist') || $dist !== $project . '/dist' || !is_dir($dist) || !is_file($dist . '/index.html')) abort_install('Build a non-symlink dist directory first using Vite with the requested base.');
foreach (['sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'] as $required) {
    if (!is_file($dist . '/' . $required)) abort_install('Build is missing ' . $required);
}
$html = file_get_contents($dist . '/index.html');
if ($html === false || !preg_match('~(?:src|href)=["\']' . preg_quote($base, '~') . 'assets/[^"\']+~', $html)) abort_install('Built asset URLs do not match the requested base. Build with vite build --base=' . $base);

$files = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dist, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
foreach ($iterator as $item) {
    $relative = substr($item->getPathname(), strlen($dist) + 1);
    if ($item->isLink() || preg_match('~(?:^|/)\.~', $relative) || (!$item->isDir() && (!$item->isFile() || preg_match('/\.(?:php\d*|phtml|phar|htaccess|env)$/i', $relative)))) abort_install('Unsafe file in dist: ' . $relative);
    if (in_array($relative, ['index.php', '.htaccess'], true)) abort_install('Reserved installer filename in dist.');
    $files[] = [$item->getPathname(), $relative, $item->isDir()];
}
$entry = file_get_contents(__DIR__ . '/index.php');
if ($entry === false || is_link(__DIR__ . '/index.php') || substr_count($entry, "const APP_BASE = '/';") !== 1) abort_install('Invalid PHP entry point.');
$api = file_get_contents(__DIR__ . '/api.php');
if ($api === false || is_link(__DIR__ . '/api.php')) abort_install('PHP API implementation is missing or is a symlink.');
$entry = str_replace("const APP_BASE = '/';", 'const APP_BASE = ' . var_export($base, true) . ';', $entry);
$htaccess = <<<'APACHE'
Options -Indexes
DirectoryIndex index.php
AddType application/manifest+json .webmanifest
RewriteEngine On
RewriteRule (^|/)\. - [F,L]
RewriteRule ^(?:api|healthz)(?:/|$) index.php [NC,L]
RewriteRule ^index\.php$ - [L]
RewriteRule \.(?:php[0-9]*|phtml|phar)$ - [F,NC,L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.php [L]
<FilesMatch "^(index\.html|sw\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
APACHE;
// mod_headers is optional; the PHP router sets these headers when it serves files.
$htaccess = str_replace("<FilesMatch", "<IfModule mod_headers.c>\n<FilesMatch", $htaccess) . "\n</IfModule>\n";
if (count(scandir($target)) !== 2) {
    $matches = true;
    foreach ($files as [$source, $relative, $directory]) {
        $destination = $target . '/' . $relative;
        if (is_link($destination) || ($directory ? !is_dir($destination) :
            (!is_file($destination) || !is_readable($destination) || !is_readable($source) || hash_file('sha256', $destination) !== hash_file('sha256', $source)))) {
            $matches = false;
            break;
        }
    }
    foreach (['index.php' => $entry, 'api.php' => $api, '.htaccess' => $htaccess] as $name => $contents) {
        $destination = $target . '/' . $name;
        if (is_link($destination) || !is_file($destination) || !is_readable($destination) || hash_file('sha256', $destination) !== hash('sha256', $contents)) $matches = false;
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
    $destination = $target . '/' . $relative;
    if ($directory) {
        if (!@mkdir($destination, 0755)) abort_install('Cannot create directory ' . $destination);
    } else {
        $contents = file_get_contents($source);
        if ($contents === false) abort_install('Cannot read ' . $source);
        write_new($destination, $contents);
    }
}
write_new($target . '/index.php', $entry);
write_new($target . '/api.php', $api);
write_new($target . '/.htaccess', $htaccess);
fwrite(STDOUT, "Installed SPA and partial PHP API at $target for $base. Most Express endpoints are NOT included.\n");
