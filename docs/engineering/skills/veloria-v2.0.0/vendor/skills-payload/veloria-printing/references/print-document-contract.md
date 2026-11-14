# Print document contract

## Document identity
- Document type and version.
- Unique human-readable number.
- Creation/business date and timezone policy.
- Store identity and contact details from an approved source.

## Financial fields
- Currency and minor-unit scale.
- Line quantity and unit description.
- Unit price and line total.
- Subtotal, discount/adjustment, tax/fees, grand total.
- Paid amount, outstanding balance, and payment method summary.
- Rounding policy version or snapshot metadata if needed for historical reproducibility.

## Machine-readable symbols
- Barcode: define symbology, encoded value, checksum, and scan use case.
- QR: define purpose, payload schema version, expiration/sensitivity, and destination behavior.
- Neither symbol may carry secrets or expose another customer's data.

## Output profiles

| Profile | Validate |
|---|---|
| 80mm thermal | printable dots, margins, wrapping, speed, cut/feed, code page |
| A4 PDF | physical units, pagination, embedded fonts, grayscale, multipage totals |
| Preview | same source data and key visual hierarchy as print |
| Labels | exact physical dimensions, orientation, gaps, barcode quiet zones |

## Physical acceptance

Record printer model, driver/connection, paper width, test document ID, expected vs observed output, scan result, and any calibration settings.
