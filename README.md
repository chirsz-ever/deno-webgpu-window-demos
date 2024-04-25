# Deno WebGPU Window Demos

This repo try to run WeGPU-backended 3D engines on [Deno](https://deno.com), like [three.js](https://threejs.org), [babylon.js](https://www.babylonjs.com), [pixi.js](https://pixijs.com), etc.

## How to run

You need install [Deno](https://deno.com) first.

For three.js demos, for now you need apply [this PR](https://github.com/mrdoob/three.js/pull/28192) by yourself. First run `deno cache` to cache the dependencies,
then modify the `node_modules/three/examples/jsm/renderers/webgpu/WebGPUBackend.js` file as the PR.

Then run the following command to run the "backdrop" demo:

```sh
deno run -A threejs/webgpu-backdrop.ts
```
