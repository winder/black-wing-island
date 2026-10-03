# 5. Three.js + TypeScript + Vite

Date: 2026-10-03
Status: Accepted

## Decision
Use Three.js for 3D rendering, TypeScript for code, and Vite for the dev server and build.

## Why
Three.js is the most widely used WebGL library and gives fine control over chunked terrain streaming and procedural meshes, which this game depends on. Babylon.js was the alternative. It has more built in, but its larger framework adds little here because most content is procedural.
