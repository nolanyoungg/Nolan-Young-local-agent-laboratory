---
name: spreadsheet-content-queue
description: Safely select and atomically claim exactly one eligible Excel content-tracker row by documented headers.
---

# Spreadsheet content queue

Validate headers, unique stable Blog IDs, status/completed values, scheduled dates, and contradictory states before selecting the first eligible row. Select no more than one row. Dry runs never mutate the workbook. Approved claims change only the selected row's permitted workflow fields and preserve unrelated sheets, formulas, formatting, and rows.
