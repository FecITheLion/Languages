<?php
declare(strict_types=1);

/**
 * PHP core entry point. Serves the single-page PWA shell (index.html built by Vite),
 * after install.php has prepared the data directory.
 */
$root = __DIR__;
$installed = is_file($root . '/data/config.json');
if (!$installed) {
    header('Location: install.php');
    exit;
}

$shell = $root . '/index.html';
if (!is_file($shell)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "index.html not found. Run `npm run build` and serve the dist/ directory.";
    exit;
}

$config = json_decode((string) file_get_contents($root . '/data/config.json'), true) ?: [];
$boot = json_encode(
    ['api' => 'api.php', 'php' => PHP_VERSION, 'installedAt' => $config['installedAt'] ?? null],
    JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP
);

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
$html = (string) file_get_contents($shell);
$inject = '<script>window.__G2J__=' . $boot . ';</script>';
echo str_contains($html, '</head>') ? str_replace('</head>', $inject . '</head>', $html) : $inject . $html;
