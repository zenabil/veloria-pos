# Monetary parity and rounding reference

## Contract table template

| Operation | Input units | Output units | Rounding rule | Trusted layer | Test |
|---|---|---|---|---|---|
| Parse amount | decimal text | integer minor | explicit parser policy | domain/write boundary | malformed + boundaries |
| Multiply by quantity | minor × scaled quantity | minor | documented scale rule | main/domain | overflow + fractional qty |
| Percentage | minor × rate | minor | documented rule | domain/main | half-boundaries |
| Allocate discount | total minor + weights | line minor values | residual distribution rule | main/domain | exact conservation |
| Refund | original paid/refundable minor | refund minor | no silent recalculation | transaction | partial + repeat |

## Rounding policy decision record

Before implementing a new calculation, record:

1. Business meaning of the amount.
2. Input precision and scale.
3. Whether intermediate values retain extra precision.
4. Exact rounding mode and tie behavior.
5. Whether rounding happens per line or after aggregation.
6. Overflow and negative-value behavior.
7. Examples at just below, exactly at, and just above a rounding boundary.

## Parity strategy

If multiple runtime layers must implement the same calculation:

- Keep a single shared pure implementation when module boundaries permit.
- If the build architecture requires mirrored code, generate it from one source where feasible or test both implementations against the same vectors.
- Do not compare only a few happy-path examples; include randomized bounded cases and failure conditions.
- Keep database CHECK/trigger rules aligned with the domain contract without duplicating complicated calculation logic in SQL.
