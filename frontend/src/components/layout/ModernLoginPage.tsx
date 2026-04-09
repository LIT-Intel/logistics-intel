11:11:56.239 
error during build:
11:11:56.239 
[vite]: Rollup failed to resolve import "@clerk/clerk-react" from "/vercel/path1/src/components/layout/ModernLoginPage.tsx".
11:11:56.239 
This is most likely unintended because it can break your application at runtime.
11:11:56.240 
If you do want to externalize this module explicitly add it to
11:11:56.240 
`build.rollupOptions.external`
11:11:56.240 
    at viteLog (file:///vercel/path1/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js:46363:15)
11:11:56.240 
    at file:///vercel/path1/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js:46421:18
11:11:56.241 
    at onwarn (file:///vercel/path1/node_modules/@vitejs/plugin-react/dist/index.js:90:7)
11:11:56.241 
    at file:///vercel/path1/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js:46419:7
11:11:56.241 
    at onRollupLog (file:///vercel/path1/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js:46411:5)
11:11:56.241 
    at onLog (file:///vercel/path1/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js:46061:7)
11:11:56.241 
    at file:///vercel/path1/node_modules/rollup/dist/es/shared/node-entry.js:20911:32
11:11:56.242 
    at Object.logger [as onLog] (file:///vercel/path1/node_modules/rollup/dist/es/shared/node-entry.js:22797:9)
11:11:56.242 
    at ModuleLoader.handleInvalidResolvedId (file:///vercel/path1/node_modules/rollup/dist/es/shared/node-entry.js:21541:26)
11:11:56.242 
    at file:///vercel/path1/node_modules/rollup/dist/es/shared/node-entry.js:21499:26
11:11:56.284 
Error: Command "npm install && npm run build" exited with 1
