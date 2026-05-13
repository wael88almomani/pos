# Hardware setup

## Receipt printer

- **Silent HTML print (recommended on Windows):** In **الإعدادات → إعدادات الأجهزة والطباعة**, choose mode *HTML — طباعة صامتة*, pick the exact Windows printer name, run **اختبار طباعة**. The receipt is RTL HTML with optional QR (invoice summary).
- **Raw ESC/POS:** Select *ESC/POS — خام*, then either **COM** (e.g. `COM4`) or **TCP** (printer IP + port `9100`). Use **اختبار طباعة** after wiring. Arabic UTF-8 depends on printer firmware; test on your model.
- **Cash drawer:** Physical kick requires the same **COM/TCP** path as the printer (ESC/POS pulse). Configure `rawTransport` accordingly; **اختبار الدرج** sends the pulse.

## Barcode scanner

Keyboard-wedge scanners work without drivers. In POS, focus stays on the grid unless an input is focused; scanned digits are buffered and submitted on Enter (see POS keyboard handler).

## Scale

- **TCP:** Many serial-to-Ethernet adapters stream weight as ASCII. Set host/port under hardware settings and use **قراءة وزن الآن**.
- **Simulated weight:** Set «وزن تجريبي» for testing without hardware.

## Files / receipts

Expense receipt images are stored under the app user data folder and exposed to the UI via the `pos-asset://` protocol (read-only, scoped to `uploads/expenses/`).
