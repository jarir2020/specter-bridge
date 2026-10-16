# CLI

The CLI currently supports these commands:

```sh
specter init <app-name> [--app-id com.example.app] [--web-dir dist]
specter add android
specter sync android
specter build android [--release]
specter run android [--release]
```

`init` creates a Vite starter, a `specter.config.json`, and a package manifest. When run from this source checkout, the generated app's package references point to the checked-out workspace. When installed from npm, the CLI uses published package versions.

`add android` refuses to overwrite an existing Android project. `sync android` replaces only `android/app/src/main/assets/public`, then reports the number of copied files. It expects the configured web directory to contain `index.html`.

`build android` uses `./gradlew` when the app has one, otherwise the installed `gradle` command. The project requires Gradle 8.13 and JDK 17. Install an Android SDK and set `ANDROID_HOME` or `ANDROID_SDK_ROOT` before building.

`run android` builds the selected variant, requires exactly one online `adb` device, installs the APK, and launches the app.
