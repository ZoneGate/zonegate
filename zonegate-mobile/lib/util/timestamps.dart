/// Timestamp formatting shared by the detail screens.
///
/// The API returns full-precision ISO-8601 (`2026-09-09T23:15:17.577797Z`).
/// Rendered verbatim that wraps onto a second line and buries the part an
/// operator actually reads, so these trim it to the useful precision.
library;

String _two(int value) => value.toString().padLeft(2, '0');

/// `2026-09-09 · 23:15 UTC` — a record's date and time.
String formatStamp(DateTime value) {
  final utc = value.toUtc();
  return '${utc.year}-${_two(utc.month)}-${_two(utc.day)}'
      ' · ${_two(utc.hour)}:${_two(utc.minute)} UTC';
}

/// `2026-09-09` — a date on its own.
String formatDate(DateTime value) {
  final utc = value.toUtc();
  return '${utc.year}-${_two(utc.month)}-${_two(utc.day)}';
}
