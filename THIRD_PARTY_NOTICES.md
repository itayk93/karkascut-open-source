# Third-party notices

The root MIT license covers project code owned by Itay Karkason. It does not replace the licenses of the material below or of dependencies installed separately.

## Capacitor native templates

The iOS and Android project templates, including default app icons and splash images, come from Capacitor CLI 8.6.2, as pinned by package-lock.json. Copyright (c) 2017-present Drifty Co. MIT license: `licenses/Capacitor-MIT.txt`.

The 30 bundled native PNG images and the Gradle wrapper JAR were verified byte-for-byte against the installed Capacitor CLI template archives before release. This does not make the template artwork original KarkasCut artwork.

## Gradle wrapper

The Gradle launcher scripts and wrapper JAR are under Apache License 2.0. Copyright notices in the launcher scripts are retained. Full license: `licenses/Apache-2.0.txt`. Gradle itself is downloaded separately by the wrapper from its configured distribution URL.

## NVIDIA eye-contact client

The optional client under `scripts/nvidia_eye_contact/` retains its original notices and `LICENSE.md`, including its listed external package licenses. NVIDIA sample video files and the example notebook are not included. Supply media you have permission to process. A source-code license does not grant use of a hosted service, model, person's likeness or third-party media.

## Bundled music

The two MP3 tracks under `assets/audio/` are CC0 1.0 works. Titles, creators, source URLs, modifications and checksums are in `assets/audio/SOURCES.md`. The CC0 text is `assets/audio/CC0-1.0.txt`. Filenames are retained for saved-project compatibility and do not imply authorship.

## Installed dependencies

JavaScript and Python dependencies are not vendored in this release. Their licenses and any separate service terms remain applicable when you install or use them. FFmpeg is an external prerequisite, not a bundled executable; its applicable license depends on the build you install.
