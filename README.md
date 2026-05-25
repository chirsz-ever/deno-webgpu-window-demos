# Deno WebGPU Window Demos

This repo try to run WeGPU-backended 3D engines on [Deno](https://deno.com), like [three.js](https://threejs.org), [babylon.js](https://www.babylonjs.com), [pixi.js](https://pixijs.com), etc.

## How to run

You need install [Deno](https://deno.com) first. Require Deno 2.8.

Then run the following command to run the "backdrop" demo from internet:

```sh
deno run --allow-net --allow-env --allow-ffi --allow-sys --unstable-webgpu --import-map https://cdn.jsdelivr.net/gh/chirsz-ever/deno-webgpu-window-demos/deno.json https://cdn.jsdelivr.net/gh/chirsz-ever/deno-webgpu-window-demos/threejs/examples/webgpu_backdrop.js
```

Or clone this repository and run:

```sh
deno run -A threejs/examples/webgpu_backdrop.js
```
