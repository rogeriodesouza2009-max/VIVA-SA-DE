# Security Specification - GlicoPulse

## Data Invariants
1. A reading must have a `userId` matching the authenticated user.
2. `createdAt` must be set to the server timestamp.
3. Values for glucose, pressure, and BPM must be within reasonable positive ranges.
4. Users can only read and write their own data.

## The "Dirty Dozen" Payloads (Denial Tests)
1. **Unauthenticated Write**: Creating a reading without being logged in.
2. **Identity Spoofing**: Creating a reading with another user's `userId`.
3. **Ghost Fields**: Adding an `isAdmin` field to a reading.
4. **Invalid Range**: Setting `glucose` to -50.
5. **Malicious ID**: Using a 2KB string as a `readingId`.
6. **Future Dating**: Setting `createdAt` to a year in the future.
7. **Bypass Query**: Attempting to list all readings without filtering by `userId`.
8. **Shadow Profile**: Trying to read another user's profile info.
9. **Update Corruption**: Trying to change the `userId` of an existing reading.
10. **Type Mismatch**: Sending a string instead of a number for `bpm`.
11. **Excessive Data**: Sending a 1MB string in a field.
12. **Null Values**: Creating a reading missing a required field like `systolic`.

## The Test Plan
- Verify that every write uses `isValidReading()` helper.
- Verify that `userId` is immutable.
- Verify that access is restricted to `isOwner()`.
