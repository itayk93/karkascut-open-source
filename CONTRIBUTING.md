# Contributing

Project contributions are distributed under the project MIT license, with third-party license notices preserved. Never include recordings, transcripts or credentials without permission.

## Work on a change

1. Read the README and install Node 22.12+ (or Node 24 LTS), FFmpeg and FFprobe.
2. Run `npm ci` and copy `.env.example` to `.env` for manual application use.
3. Work on a branch. Keep the change small and explain the user-visible problem.
4. Add a regression test that fails before the fix. Prefer synthetic media;
   never commit user recordings, real transcripts, keys or generated output.
5. Run typecheck, lint, tests and build as described in the README.

For media changes, check duration, audio/video streams, actual rendered frames,
and the behavior being changed. A successful encode is not visual verification.
For speech editing, protect word edges and restored sections; verify against
real representative Hebrew speech only with media the owner has approved.

The optional eye-contact integration requires the Python setup in the README.
CI requires it, while an ordinary install reports the test as skipped if absent.
A synthetic test is not evidence of gaze-correction quality on real people.

## Review checklist

- No changed license, visibility, deployment or paid-provider use as a side effect.
- No hard-coded machine paths or reliance on bundled copyrighted media in tests.
- Handle invalid input, unavailable subprocesses, cancellation and cleanup.
- Preserve existing edits and the original recording; do not silently trim words.
- Include exact checks and honest limitations. Do not claim users, adoption,
  contributors, benchmarks or program eligibility without evidence.

Read SECURITY.md before exposing any service or preparing a release.
