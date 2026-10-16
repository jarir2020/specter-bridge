# Use a Ghost.js build

Specter Bridge can host a Ghost.js mobile build without changing the generated Android project.

1. In the Ghost.js app, build the WebView bundle:

   ```sh
   ghost build --target=mobile
   ```

   Ghost.js writes `dist/build/index.html` and `dist/build/bundle.js`.

2. Create a Specter Bridge app with `specter init`, then add Android:

   ```sh
   npx specter add android
   ```

3. In the Specter app's `specter.config.json`, point `webDir` at the Ghost.js `dist/build` directory. For example, if the Ghost app is a sibling folder, use `../ghost-app/dist/build`.

4. Sync and build:

   ```sh
   npx specter sync android
   npx specter build android
   npx specter run android
   ```

When using a Ghost.js output directory, do not run the generated Vite starter's `npm run build`; build the Ghost.js project and sync its output instead. Keep the Ghost.js output's local asset references relative to `index.html`, and include assets that Ghost.js does not bundle in `dist/build`.

The native Storage API is imported in the Ghost.js source using `@specter-bridge/plugin-storage` after that npm package is published or linked into the app. Android must register a corresponding native plugin; the generated Specter project registers Storage by default.
