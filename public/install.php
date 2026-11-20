<?php
declare(strict_types=1);

/**
 * One-time installer: checks the PHP environment, creates data/ (web-protected),
 * and writes data/config.json. Re-running is blocked once installed.
 */
$root = __DIR__;
$dataDir = $root . '/data';
$configFile = $dataDir . '/config.json';

$checks = [
    'PHP >= 8.0' => version_compare(PHP_VERSION, '8.0.0', '>='),
    'json extension' => extension_loaded('json'),
    'index.html built (run npm run build)' => is_file($root . '/index.html'),
    'directory writable' => is_writable($root) || is_dir($dataDir) && is_writable($dataDir),
];
$ok = !in_array(false, $checks, true);
$already = is_file($configFile);
$message = '';

if (!$already && $ok && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true)) {
        $message = 'Could not create data directory.';
    } else {
        file_put_contents($dataDir . '/.htaccess', "Require all denied\nDeny from all\n");
        file_put_contents($dataDir . '/index.html', '');
        $cfg = ['installedAt' => gmdate('c'), 'php' => PHP_VERSION, 'version' => '1.0.0'];
        if (file_put_contents($configFile, json_encode($cfg, JSON_PRETTY_PRINT)) === false) {
            $message = 'Could not write config.json.';
        } else {
            header('Location: index.php');
            exit;
        }
    }
}

header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install — Grammar2JSON Studio</title>
<style>body{font:15px system-ui,sans-serif;max-width:560px;margin:3rem auto;padding:0 1rem;color:#0f172a}
li{margin:.3rem 0}.ok{color:#047857}.bad{color:#b91c1c}button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:.6rem 1.2rem;font-size:15px;cursor:pointer}button:disabled{opacity:.4}</style>
</head>
<body>
<h1>Grammar2JSON Studio</h1>
<?php if ($already): ?>
  <p>Already installed. <a href="index.php">Open the studio</a>. Delete <code>data/config.json</code> to reinstall.</p>
<?php else: ?>
  <p>Environment check:</p>
  <ul>
  <?php foreach ($checks as $label => $pass): ?>
    <li class="<?= $pass ? 'ok' : 'bad' ?>"><?= $pass ? '✔' : '✘' ?> <?= htmlspecialchars($label) ?></li>
  <?php endforeach; ?>
  </ul>
  <?php if ($message !== ''): ?><p class="bad"><?= htmlspecialchars($message) ?></p><?php endif; ?>
  <form method="post"><button type="submit" <?= $ok ? '' : 'disabled' ?>>Install</button></form>
<?php endif; ?>
</body>
</html>
