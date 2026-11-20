<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function session_mint_id(): string {
    return 's_' . bin2hex(random_bytes(8));
}

function session_validate_id(string $id): string {
    $clean = trim($id);
    if ($clean !== 'default' && !preg_match(SESSION_ID_PATTERN, $clean)) {
        throw new InputError('Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.', 400);
    }
    return $clean;
}

function session_request_bundle(): stdClass {
    $maxBytes = 2097152;
    $body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($body === false || strlen($body) > $maxBytes) {
        throw new InputError('Session payload exceeds 2 MiB limit.');
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        throw new InputError('Use application/json.');
    }
    try {
        $decoded = json_decode($body, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new InputError('Malformed JSON session body.');
    }
    if (!$decoded instanceof stdClass) {
        throw new InputError('Session payload must be a JSON object.');
    }
    return $decoded;
}

function serve_sessions(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/sessions', 'method'=>'GET'];
    $id = $route === 'api/sessions' ? null : rawurldecode(substr($route, strlen('api/sessions/')));

    try {
        $db = logic_store();
        $current = api_session_id();

        if ($id === null) {
            if (in_array($method, ['GET', 'HEAD'], true)) {
                $sessions = [];
                $seen = [];
                if ($db !== null) {
                    $rows = $db->query(
                        'SELECT session_id, updated_at, 1 AS has_history FROM session_history '
                        . 'UNION '
                        . 'SELECT session_id, updated_at, 0 AS has_history FROM session_states'
                    )->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($rows as $row) {
                        $sid = (string)$row['session_id'];
                        if (!isset($seen[$sid]) || (int)$row['has_history'] === 1) {
                            $seen[$sid] = [
                                'sessionId' => $sid,
                                'updatedAt' => (string)$row['updated_at'],
                                'hasHistory' => (bool)$row['has_history'],
                                '_links' => [
                                    'self' => ['href'=>$collection['href'].'/'.rawurlencode($sid), 'method'=>'GET'],
                                    'share' => ['href'=>$prefix.'/?session='.rawurlencode($sid), 'method'=>'GET'],
                                ],
                            ];
                        }
                    }
                    $sessions = array_values($seen);
                }
                api_json(200, [
                    'ok' => true,
                    'count' => count($sessions),
                    'currentSessionId' => $current,
                    'sessions' => $sessions,
                    '_links' => ['self'=>$collection, 'root'=>['href'=>$prefix.'/api', 'method'=>'GET']],
                ], true);
            }

            if ($method === 'POST') {
                if ($db === null) {
                    throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
                }
                $input = logic_request_object(true);
                $sourceId = is_string($input->sourceSessionId ?? null) && trim($input->sourceSessionId) !== ''
                    ? session_validate_id($input->sourceSessionId)
                    : null;
                $newId = is_string($input->sessionId ?? null) && trim($input->sessionId) !== ''
                    ? session_validate_id($input->sessionId)
                    : session_mint_id();
                $now = gmdate('Y-m-d\TH:i:s') . '.000Z';

                $db->exec('BEGIN IMMEDIATE');
                try {
                    if ($sourceId !== null) {
                        $srcState = $db->prepare('SELECT data FROM session_states WHERE session_id = ?');
                        $srcState->execute([$sourceId]);
                        $stateData = $srcState->fetchColumn();
                        if ($stateData === false && $sourceId === 'default') {
                            $stateData = $db->query('SELECT data FROM logic_state WHERE id = 1')->fetchColumn();
                        }
                        if ($stateData !== false) {
                            $db->prepare('INSERT INTO session_states (session_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
                                ->execute([$newId, $stateData, $now]);
                        }
                        $srcHist = $db->prepare('SELECT payload FROM session_history WHERE session_id = ?');
                        $srcHist->execute([$sourceId]);
                        $histPayload = $srcHist->fetchColumn();
                        if ($histPayload !== false) {
                            $decoded = json_decode((string)$histPayload, true);
                            if (is_array($decoded)) {
                                $decoded['sessionId'] = $newId;
                                $decoded['updatedAt'] = $now;
                                $histPayload = json_encode($decoded, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                            }
                            $db->prepare('INSERT INTO session_history (session_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at')
                                ->execute([$newId, (string)$histPayload, $now]);
                        }
                    }
                    $db->exec('COMMIT');
                } catch (Throwable $e) {
                    if ($db->inTransaction()) $db->exec('ROLLBACK');
                    throw $e;
                }

                $selfHref = $collection['href'].'/'.rawurlencode($newId);
                header('Location: '.$selfHref);
                api_json(201, [
                    'ok' => true,
                    'sessionId' => $newId,
                    'clonedFrom' => $sourceId,
                    'shareQuery' => '?session='.rawurlencode($newId),
                    'shareUrl' => $prefix.'/?session='.rawurlencode($newId),
                    '_links' => [
                        'self' => ['href'=>$selfHref, 'method'=>'GET'],
                        'collection' => $collection,
                    ],
                ], true);
            }

            header('Allow: GET, HEAD, POST, OPTIONS');
            api_json(405, ['ok'=>false, 'error'=>'Method not allowed.'], true);
        }

        $sid = session_validate_id($id);
        $self = ['href'=>$collection['href'].'/'.rawurlencode($sid), 'method'=>'GET'];

        if (in_array($method, ['GET', 'HEAD'], true)) {
            if ($db === null) {
                api_json(200, [
                    'ok' => true,
                    'exists' => false,
                    'sessionId' => $sid,
                    'updatedAt' => null,
                    'bundle' => null,
                    '_links' => ['self'=>$self, 'collection'=>$collection],
                ], true);
            }
            $stmt = $db->prepare('SELECT payload, updated_at FROM session_history WHERE session_id = ?');
            $stmt->execute([$sid]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                api_json(200, [
                    'ok' => true,
                    'exists' => false,
                    'sessionId' => $sid,
                    'updatedAt' => null,
                    'bundle' => null,
                    '_links' => ['self'=>$self, 'collection'=>$collection],
                ], true);
            }
            $bundle = json_decode((string)$row['payload'], false, 64, JSON_THROW_ON_ERROR);
            api_json(200, [
                'ok' => true,
                'exists' => true,
                'sessionId' => $sid,
                'updatedAt' => (string)$row['updated_at'],
                'bundle' => $bundle,
                '_links' => [
                    'self' => $self,
                    'collection' => $collection,
                    'share' => ['href'=>$prefix.'/?session='.rawurlencode($sid), 'method'=>'GET'],
                ],
            ], true);
        }

        if ($method === 'PUT') {
            if ($db === null) {
                throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
            }
            $body = session_request_bundle();
            $bundleObj = ($body->bundle ?? null) instanceof stdClass ? $body->bundle : $body;
            $now = gmdate('Y-m-d\TH:i:s') . '.000Z';
            $bundleCopy = json_decode(json_encode($bundleObj, JSON_THROW_ON_ERROR), true, 64, JSON_THROW_ON_ERROR);
            $bundleCopy['sessionId'] = $sid;
            $bundleCopy['updatedAt'] = $now;
            $encoded = json_encode($bundleCopy, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $db->prepare('INSERT INTO session_history (session_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at')
                ->execute([$sid, $encoded, $now]);
            api_json(200, [
                'ok' => true,
                'sessionId' => $sid,
                'updatedAt' => $now,
                'shareUrl' => $prefix.'/?session='.rawurlencode($sid),
                '_links' => ['self'=>$self, 'collection'=>$collection],
            ], true);
        }

        if ($method === 'DELETE') {
            if ($db === null) {
                throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
            }
            $db->prepare('DELETE FROM session_history WHERE session_id = ?')->execute([$sid]);
            $db->prepare('DELETE FROM session_states WHERE session_id = ?')->execute([$sid]);
            if ($sid === 'default') {
                $db->exec('DELETE FROM logic_state WHERE id = 1');
            }
            api_json(200, [
                'ok' => true,
                'deleted' => $sid,
                '_links' => ['collection'=>$collection],
            ], true);
        }

        header('Allow: GET, HEAD, PUT, DELETE, OPTIONS');
        api_json(405, ['ok'=>false, 'error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['ok'=>false, 'error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['ok'=>false, 'error'=>$error->getMessage()], true);
    } catch (JsonException) {
        api_json(500, ['ok'=>false, 'error'=>'Failed to decode stored session data.'], true);
    }
}
