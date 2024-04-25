// https://github.com/mrdoob/three.js/blob/81b782ad8b13eae6dbd3335cf295f7a00bba98ff/examples/webgpu_backdrop.html

import * as THREE from 'three';
import { float, vec3, color, toneMapping, viewportSharedTexture, viewportTopLeft, checker, uv, timerLocal, oscSine, output, MeshStandardNodeMaterial } from 'three/nodes';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import WebGPU from 'three/addons/capabilities/WebGPU.js';
// import WebGL from 'three/addons/capabilities/WebGL.js';

import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
    EventType,
    WindowBuilder,
    getKeyName
} from "deno_sdl2";

/* Deno code begin */

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    console.error("init WebGPU failed: adapter is", adapter);
    Deno.exit(1);
}

const device = await adapter.requestDevice();

let WIDTH = 800;
let HEIGHT = 600;

const surfaceFormat = navigator.gpu.getPreferredCanvasFormat();

const win = new WindowBuilder("Three.js demo - webgpu/backdrop", WIDTH, HEIGHT).build();
const surface = win.windowSurface();
const context = surface.getContext("webgpu")
context.configure({
    device,
    format: surfaceFormat,
    width: WIDTH,
    height: HEIGHT,
})

// polyfill

const canvasDomMock = {
    style: {},
    // TODO: implement or polyfill the event system
    addEventListener(event: string) {
        console.info(`canvas.addEventListener("${event}", ...)`)
    },
    getRootNode() {
        console.info(`canvas.getRootNode()`);
        return this;
    },
    getContext(name: string) {
        console.info(`canvas.getContext("${name}")`);
        return contextMock;
    }
}

const contextMock = {
    configure(configuration: GPUCanvasConfiguration) {
        configuration.width = WIDTH;
        configuration.height = HEIGHT;
        // FIXME: https://github.com/denoland/deno/issues/23509
        if (configuration.alphaMode === "premultiplied") {
            configuration.alphaMode = "opaque";
        }
        context.configure(configuration);
    },
    getCurrentTexture(): GPUTexture {
        return context.getCurrentTexture();
    },
    unconfigure() {
        context.unconfigure();
    }
}

let rafCallback: (() => void) | undefined;
globalThis.requestAnimationFrame = (callback: () => void) => {
    // console.trace("window.requestAnimationFrame()");
    rafCallback = callback;
}

/* Deno code end */

let camera: THREE.camera, scene: THREE.Scene, renderer: WebGPURenderer;
let portals: THREE.Group, rotate = true;
let mixer: THREE.AnimationMixer, clock: THREE.Clock;

init();

function init() {

    /*
    if (WebGPU.isAvailable() === false && WebGL.isWebGL2Available() === false) {
        document.body.appendChild(WebGPU.getErrorMessage());
        throw new Error('No WebGPU or WebGL2 support');
    }
    */

    if (WebGPU.isAvailable() === false) {
        throw new Error('No WebGPU support');
    }

    camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.01, 100);
    camera.position.set(1, 2, 3);

    scene = new THREE.Scene();
    scene.backgroundNode = viewportTopLeft.y.mix(color(0x66bbff), color(0x4466ff));
    camera.lookAt(0, 1, 0);

    clock = new THREE.Clock();

    //lights

    const light = new THREE.SpotLight(0xffffff, 1);
    light.power = 2000;
    camera.add(light);
    scene.add(camera);

    // FIXME: Failed load textures, https://github.com/denoland/deno/issues/22649
    const loader = new GLTFLoader();
    loader.load("https://threejs.org/examples/models/gltf/Michelle.glb",
        (gltf) => {
            console.log("load gltf success")
            const object = gltf.scene;
            mixer = new THREE.AnimationMixer(object);

            const material = object.children[0].children[0].material;

            // output material effect ( better using hsv )
            // ignore output.sRGBToLinear().linearTosRGB() for now

            material.outputNode = oscSine(timerLocal(.1)).mix(output, output.add(.1).posterize(4).mul(2));

            const action = mixer.clipAction(gltf.animations[0]);
            action.play();

            scene.add(object);

        },
        // (progress) => {
        //     console.info(`load gltf progress: ${progress.loaded}/${progress.total}`);
        // },
        undefined,
        (err: Error) => {
            console.error("load gltf failed");
            throw err;
        });

    // portals

    const geometry = new THREE.SphereGeometry(.3, 32, 16);

    portals = new THREE.Group();
    scene.add(portals);

    function addBackdropSphere(backdropNode, backdropAlphaNode = null) {

        const distance = 1;
        const id = portals.children.length;
        const rotation = THREE.MathUtils.degToRad(id * 45);

        const material = new MeshStandardNodeMaterial({ color: 0x0066ff });
        material.roughnessNode = float(.2);
        material.metalnessNode = float(0);
        material.backdropNode = backdropNode;
        material.backdropAlphaNode = backdropAlphaNode;
        material.transparent = true;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            Math.cos(rotation) * distance,
            1,
            Math.sin(rotation) * distance
        );

        portals.add(mesh);

    }

    addBackdropSphere(viewportSharedTexture().bgr.hue(oscSine().mul(Math.PI)));
    addBackdropSphere(viewportSharedTexture().rgb.oneMinus());
    addBackdropSphere(viewportSharedTexture().rgb.saturation(0));
    addBackdropSphere(viewportSharedTexture().rgb.saturation(10), oscSine());
    addBackdropSphere(viewportSharedTexture().rgb.overlay(checker(uv().mul(10))));
    addBackdropSphere(viewportSharedTexture(viewportTopLeft.mul(40).floor().div(40)));
    addBackdropSphere(viewportSharedTexture(viewportTopLeft.mul(80).floor().div(80)).add(color(0x0033ff)));
    addBackdropSphere(vec3(0, 0, viewportSharedTexture().b));

    //renderer

    renderer = new WebGPURenderer({
        antialias: true,
        device,
        canvas: canvasDomMock,
        context: contextMock,
    });
    // renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.setAnimationLoop(animate);
    renderer.toneMappingNode = toneMapping(THREE.LinearToneMapping, .3);
    // document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.addEventListener('start', () => rotate = false);
    controls.addEventListener('end', () => rotate = true);
    controls.update();

    // window.addEventListener('resize', onWindowResize);

}

function onWindowResize(w: number, h: number) {

    WIDTH = w;
    HEIGHT = h;
    camera.aspect = WIDTH / HEIGHT;
    camera.updateProjectionMatrix();

    renderer.setSize(WIDTH, HEIGHT);

}

function animate() {

    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (rotate) portals.rotation.y += delta * 0.5;

    renderer.render(scene, camera);
    surface.present();
}

const VALIDATION = Deno.args[0] == "--enable-validation";

// TODO: Handle mouse and keyboard events, handle window resize event
for await (const event of win.events()) {
    if (event.type === EventType.Quit) break;
    else if (event.type === EventType.KeyDown) {
        if (getKeyName(event.keysym.sym) === "Escape") {
            break;
        }
        continue;
    }
    else if (event.type === EventType.WindowEvent) {
        switch (event.event) {
            case 5: // SDL_WINDOWEVENT_RESIZED
                console.info("resized!")
                onWindowResize(event.data1, event.data2)
                continue;
        }
    }
    else if (event.type !== EventType.Draw) continue;

    if (VALIDATION)
        device.pushErrorScope("validation");

    if (rafCallback) {
        const callback = rafCallback;
        rafCallback = undefined;
        callback();
    }

    if (VALIDATION)
        device.popErrorScope().then((error) => {
            if (error)
                console.error(`WebGPU validation error: ${error?.message}`);
        });

    // FIXME: deno_sdl2 UI events would block network events?
    await new Promise((resolve) => setTimeout(resolve, 1));
}
