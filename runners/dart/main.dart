import 'dart:async';
import 'dart:convert';
import 'dart:io';

bool privateAddress(InternetAddress address) {
  final b = address.rawAddress;
  if (address.isLoopback || address.isLinkLocal || address.isMulticast)
    return true;
  if (b.length == 4)
    return b[0] == 0 ||
        b[0] == 10 ||
        b[0] == 127 ||
        b[0] == 169 && b[1] == 254 ||
        b[0] == 172 && b[1] >= 16 && b[1] <= 31 ||
        b[0] == 192 && b[1] == 168 ||
        b[0] >= 224 ||
        b[0] == 100 && b[1] >= 64 && b[1] <= 127;
  if (b.every((x) => x == 0) || (b[0] & 254) == 252) return true;
  if (b.take(10).every((x) => x == 0) && b[10] == 255 && b[11] == 255)
    return privateAddress(InternetAddress.fromRawAddress(b.sublist(12)));
  return false;
}

// Fixed interpreter of structured tests. Never compiles or evaluates generated code.
Future<void> main(List<String> args) async {
  try {
    if (args.any((arg) => arg != '--ndjson'))
      throw StateError('Unsupported argument');
    final streamRecords = args.contains('--ndjson');
    var outputBytes = 0;
    final input = jsonDecode(
      await stdin.transform(utf8.decoder).join(),
    ) as Map<String, dynamic>;
    final records = <Map<String, dynamic>>[];
    final token = input['authToken']?.toString() ?? '';
    String mask(String value) {
      if (token.isNotEmpty) value = value.replaceAll(token, '[REDACTED]');
      value = value.replaceAllMapped(
        RegExp(r'(bearer\s+)[a-z0-9._~+/=-]+', caseSensitive: false),
        (m) => '${m[1]}[REDACTED]',
      );
      return value.replaceAllMapped(
        RegExp(
          r'("(?:password|token|apiKey|secret|authorization|access_token|refresh_token)"\s*:\s*")[^"]*',
          caseSensitive: false,
        ),
        (m) => '${m[1]}[REDACTED]',
      );
    }

    for (final raw in (input['tests'] as List? ?? [])) {
      final t = Map<String, dynamic>.from(raw as Map);
      final watch = Stopwatch()..start();
      final method = (t['method'] ?? 'GET').toString().toUpperCase();
      final body = (t['body'] ?? '').toString();
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 10);
      client.findProxy = (_) => 'DIRECT';
      client.connectionFactory = (uri, proxyHost, proxyPort) async {
        final fixture = Uri.parse(
          Platform.environment['NUZUL_FIXTURE_ORIGIN'] ??
              'http://localhost:5190',
        );
        final addresses = await InternetAddress.lookup(uri.host);
        if (addresses.isEmpty ||
            (uri.origin != fixture.origin && addresses.any(privateAddress)))
          throw StateError('Private or reserved network target blocked');
        return Socket.startConnect(addresses.first, uri.port);
      };
      var outcome = 'Blocked',
          status = 0,
          responseBody = '',
          error = '',
          actual = '',
          assertionsResult = '';
      var url = '';
      try {
        final executable =
            t['approved'] == true &&
            t['excluded'] != true &&
            (t['path'] ?? '') != '';
        final base = Uri.parse(
          executable ? input['baseUrl'].toString() : 'http://localhost',
        );
        final target = base.resolve((t['path'] ?? '').toString());
        url = target.toString();
        if (executable &&
            (!['http', 'https'].contains(base.scheme) ||
                target.origin != base.origin ||
                target.userInfo.isNotEmpty ||
                target.fragment.isNotEmpty ||
                !(t['path'] ?? '').toString().startsWith('/') ||
                (t['path'] ?? '').toString().contains('{'))) {
          throw StateError('Only same-origin HTTP(S) endpoints are supported');
        }
        if (t['approved'] != true || t['excluded'] == true) {
          outcome = 'Skipped';
          actual = 'Test is excluded or not approved';
        } else if ((t['path'] ?? '') == '') {
          outcome = 'Needs Review';
          actual = 'Static/manual case requires human review';
        } else if (![
          'GET',
          'HEAD',
          'OPTIONS',
          'POST',
          'PUT',
          'PATCH',
          'DELETE',
        ].contains(method)) {
          actual = 'Unsupported HTTP method';
        } else if (!['GET', 'HEAD', 'OPTIONS'].contains(method) &&
            input['allowMutations'] != true) {
          actual = 'Mutation permission required';
        } else {
          final operation = () async {
            final request = await client.openUrl(method, target);
            request.followRedirects = false;
            if (token.isNotEmpty)
              request.headers.set('Authorization', 'Bearer $token');
            if (body.isNotEmpty) {
              request.headers.contentType = ContentType.json;
              request.headers.set(HttpHeaders.acceptHeader, 'application/json');
              request.write(body);
            }
            final response = await request.close();
            status = response.statusCode;
            final bytes = <int>[];
            await for (final chunk in response) {
              bytes.addAll(chunk);
              if (bytes.length > 262144)
                throw StateError('Response exceeds 256 KiB evidence limit');
            }
            responseBody = utf8.decode(bytes, allowMalformed: true);
          };
          await operation().timeout(const Duration(seconds: 10));
          actual = 'HTTP $status';
          if (status == 401 || status == 403) {
            outcome = 'Blocked';
            error = 'Authentication or authorization failure';
          } else if (status >= 300 && status < 400) {
            outcome = 'Blocked';
            error = 'Redirects are not followed';
          } else {
            final assertions = List<Map<String, dynamic>>.from(
              (t['assertions'] as List? ?? []).map(
                (a) => Map<String, dynamic>.from(a),
              ),
            );
            if (t['expectedStatus'] != null &&
                !assertions.any((a) => a['kind'] == 'status')) {
              assertions.insert(0, {
                'kind': 'status',
                'path': '',
                'expected': t['expectedStatus'].toString(),
              });
            }
            if (assertions.isEmpty) {
              outcome = 'Needs Review';
              assertionsResult =
                  'Needs oracle: no deterministic expected result';
            } else {
              final checks = <String>[];
              var failed = false;
              var unsupported = false;
              for (final a in assertions) {
                final kind = a['kind'];
                final path = (a['path'] ?? '').toString();
                var passed = false;
                var observed = '';
                if (kind == 'status') {
                  observed = '$status';
                  passed = observed == a['expected'].toString();
                } else if (kind == 'jsonEquals' || kind == 'jsonExists') {
                  dynamic value;
                  var exists = true;
                  try {
                    value = jsonDecode(responseBody);
                    for (final segment
                        in path.split('.').where((p) => p.isNotEmpty)) {
                      if (value is Map && value.containsKey(segment)) {
                        value = value[segment];
                      } else if (value is List &&
                          int.tryParse(segment) != null &&
                          int.parse(segment) >= 0 &&
                          int.parse(segment) < value.length) {
                        value = value[int.parse(segment)];
                      } else {
                        exists = false;
                        break;
                      }
                    }
                  } catch (_) {
                    exists = false;
                  }
                  observed = exists
                      ? (value is String ? value : jsonEncode(value))
                      : '<missing>';
                  passed = kind == 'jsonExists'
                      ? exists
                      : exists && observed == a['expected'].toString();
                } else {
                  unsupported = true;
                  observed = 'Unsupported assertion';
                }
                if (!passed) failed = true;
                checks.add(
                  '$kind $path: ${passed ? 'PASS' : 'FAIL'} expected=${a['expected'] ?? 'exists'} actual=$observed',
                );
              }
              outcome = unsupported
                  ? 'Blocked'
                  : failed
                  ? 'Failed'
                  : 'Passed';
              assertionsResult = checks.join('\n');
            }
          }
        }
      } catch (e) {
        outcome = 'Blocked';
        error = e.toString();
        actual = 'Environment or execution error';
      } finally {
        client.close(force: true);
        watch.stop();
      }
      final record = <String, dynamic>{
        'testCaseId': t['id'],
        'outcome': outcome,
        'request': {'method': method, 'url': mask(url), 'body': mask(body)},
        'response': {'status': status, 'body': mask(responseBody)},
        'expectedResult': t['expectedResult'] ?? '',
        'actualResult': actual,
        'assertionOutcome': assertionsResult,
        'durationMs': watch.elapsedMilliseconds,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        'errorDetails': error,
        'evidenceReference':
            'dart-${t['id']}-${DateTime.now().microsecondsSinceEpoch}',
      };
      // Scrub exact configured credential even if the target echoes it in any field.
      final safeRecord = mask(jsonEncode(record));
      outputBytes += utf8.encode(safeRecord).length + 2;
      if (outputBytes > 8000000)
        throw StateError('Runner output limit exceeded');
      if (streamRecords) {
        stdout.writeln(safeRecord);
        await stdout.flush();
      } else {
        records.add(jsonDecode(safeRecord) as Map<String, dynamic>);
      }
    }
    if (!streamRecords) stdout.write(jsonEncode(records));
  } catch (_) {
    stderr.writeln('Invalid runner input');
    exitCode = 2;
  }
}
