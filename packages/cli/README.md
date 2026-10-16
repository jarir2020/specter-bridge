# @specter-bridge/cli

CLI for generating the Android project, syncing web output, building APKs, and installing an app on a connected Android device.

```sh
npx --yes --package=@specter-bridge/cli specter init "My App" --app-id com.example.myapp
cd my-app
npm install
npm run build
npx specter add android
npx specter sync android
npx specter build android
npx specter run android
```

Android builds require Android SDK Platform 35, JDK 17, and Gradle 8.13 through 8.x. The initial release supports Android only.
