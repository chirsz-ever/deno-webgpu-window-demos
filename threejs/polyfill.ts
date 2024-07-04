// deno-lint-ignore-file no-explicit-any

import { join, dirname } from "std/path/mod.ts"
import * as fs from "std/fs/mod.ts"
import { getPixels } from "https://deno.land/x/get_pixels@v1.2.2/mod.ts";
import { parseGIF, decompressFrames } from "npm:gifuct-js@2.1.2"

import {
    EventType,
    WindowBuilder,
    getKeyName,
    Window,
} from "deno_sdl2";

import WebGPUBackend from 'three/addons/renderers/webgpu/WebGPUBackend.js';
import { GPUFeatureName as gpu_feature_names } from 'three/addons/renderers/webgpu/utils/WebGPUConstants.js';

// for load MaterialX
import { DOMParser } from "https://esm.sh/linkedom@0.18.4";
(globalThis as any).DOMParser = DOMParser;

const WIDTH = 1000;
const HEIGHT = 750;

class MouseEvent extends Event {
    altKey: boolean = false;
    button: number = 0;
    buttons: number = 0;
    clientX: number = 0;
    clientY: number = 0;
    ctrlKey: boolean = false;
    // layerX: number = 0;
    // layerY: number = 0;
    metaKey: boolean = false;
    movementX: number = 0;
    movementY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    pageX: number = 0;
    pageY: number = 0;
    relatedTarget: EventTarget | null = null;
    screenX: number = 0;
    screenY: number = 0;
    shiftKey: boolean = false;
    x: number = 0;
    y: number = 0;

    constructor(name: string, options?: EventInit) {
        super(name, options)
    }
}

class WheelEvent extends MouseEvent {
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    deltaZ: number = 0;
    DOM_DELTA_PIXEL = 0x00;
    DOM_DELTA_LINE = 0x01;
    DOM_DELTA_PAGE = 0x02;

    constructor(deltaX: number, deltaY: number) {
        super("wheel");
        this.deltaX = deltaX;
        this.deltaY = deltaY;
        this.deltaMode = this.DOM_DELTA_PIXEL;
    }
}

const _ignoredEvents = [
    "pointerdown", "pointermove", "pointerup", "wheel"
];

class CanvasDomMock extends EventTarget {
    style = {}

    get clientHeight() {
        return this.height;
    }

    get clientWidth() {
        return this.width;
    }

    constructor(private canvas: Deno.UnsafeWindowSurface, private width: number, private height: number) {
        super();
    }

    addEventListener(event: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        super.addEventListener(event, listener, options);
        // if (!_ignoredEvents.includes(event))
        //     console.info(`canvas.addEventListener("${event}", ...)`)
    }

    getRootNode() {
        // console.info(`canvas.getRootNode()`);
        return this;
    }

    getContext(name: string) {
        if (name !== "webgpu") {
            throw new Error(`canvas.getContext("${name}") is not supported`)
        }
        const context = this.canvas.getContext(name);
        return new GPUCanvasContextMock(context, this.width, this.height);
    }

    setPointerCapture() {
        // console.info(`canvas.setPointerCapture()`);
    }

    releasePointerCapture() {
        // console.info(`canvas.releasePointerCapture()`);
    }
}

let lastMoveMouseEvent: MouseEvent | null = null;

function setMouseEventXY(evt: MouseEvent, x: number, y: number, isMove = false) {
    evt.pageX = evt.offsetX = evt.screenX = evt.clientX = evt.x = x;
    evt.pageY = evt.offsetY = evt.screenY = evt.clientY = evt.y = y;

    evt.movementX = lastMoveMouseEvent ? evt.screenX - lastMoveMouseEvent.screenX : 0;
    evt.movementY = lastMoveMouseEvent ? evt.screenY - lastMoveMouseEvent.screenY : 0;

    if (isMove) {
        lastMoveMouseEvent = evt;
    }
}

// FIXME: https://github.com/denoland/deno/issues/23433
// for this, we had to create the device before anything
let device: GPUDevice;
const WebGPUBackend_init_origin = WebGPUBackend.prototype.init;
WebGPUBackend.prototype.init = function init(renderer: any) {
    this.parameters.device = device;
    this.parameters.canvas = canvasDomMock;
    this.parameters.context = contextMock;
    return WebGPUBackend_init_origin.call(this, renderer);
}

let win: Window;
let surface: Deno.UnsafeWindowSurface;
let canvasDomMock: CanvasDomMock;
let contextMock: GPUCanvasContextMock;
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

type FrameRequestCallback = (time: number) => void;

let requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
    // console.trace("window.requestAnimationFrame()");
    requestAnimationFrameCallbacks.push(callback);
}

function sleep(timeout: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeout))
}

const VALIDATION = Deno.args[0] == "--enable-validation";

let button0 = 0;
let currentTextureGot = false;

export async function runWindowEventLoop() {
    // TODO: Handle mouse and keyboard events, handle window resize event
    for await (const event of win.events()) {
        if (event.type === EventType.Quit) {
            break;
        } else if (event.type === EventType.KeyDown) {
            if (getKeyName(event.keysym.sym) === "Escape") {
                break;
            } else if (getKeyName(event.keysym.sym) === "F1") {
                Deno.exit(1)
            }
        } else if (event.type == EventType.MouseButtonDown) {
            const evt = new MouseEvent("pointerdown");
            setMouseEventXY(evt, event.x, event.y);
            evt.buttons = 1;
            button0 = 1;
            canvasDomMock.dispatchEvent(evt);
        } else if (event.type == EventType.MouseButtonUp) {
            const evt = new MouseEvent("pointerup");
            setMouseEventXY(evt, event.x, event.y);
            evt.buttons = 0;
            button0 = 0;
            canvasDomMock.dispatchEvent(evt);
        } else if (event.type == EventType.MouseMotion) {
            const evt = new MouseEvent("pointermove");
            setMouseEventXY(evt, event.x, event.y, true);
            evt.buttons = button0;
            canvasDomMock.dispatchEvent(evt);
        } else if (event.type == EventType.MouseWheel) {
            const evt = new WheelEvent(event.x * 120, event.y * 120);
            setMouseEventXY(evt, lastMoveMouseEvent!.x, lastMoveMouseEvent!.y);
            canvasDomMock.dispatchEvent(evt);
        }
        else if (event.type === EventType.WindowEvent) {
            switch (event.event) {
                // SDL_WINDOWEVENT_SIZE_CHANGED
                case 6: {
                    // console.info(`resize(${event.data1}, ${event.data2})`);
                    const new_width = event.data1;
                    const new_height = event.data2;
                    (window as any).innerWidth = new_width;
                    (window as any).innerHeight = new_height;
                    contextMock._resize(new_width, new_height);

                    requestAnimationFrameCallbacks.unshift(() => {
                        (window).dispatchEvent(new Event("resize"));
                    });
                }
            }
        }
        else if (event.type === EventType.Draw) {

            if (VALIDATION)
                device.pushErrorScope("validation");

            if (requestAnimationFrameCallbacks.length != 0) {
                const currentCallbacks = requestAnimationFrameCallbacks;
                requestAnimationFrameCallbacks = [];
                const t = performance.now();
                while (currentCallbacks.length != 0) {
                    const callback = currentCallbacks.shift();
                    callback!(t);
                }
            }

            if (currentTextureGot) {
                contextMock._renderCurrentTexture();
                surface.present();
                currentTextureGot = false;
            }

            if (VALIDATION) {
                device.popErrorScope().then((error) => {
                    if (error) {
                        console.error(`WebGPU validation error: ${error.message}`);
                        Deno.exit(1);
                    }
                });
            }

            // FIXME: deno_sdl2 UI events would block network events?
            await sleep(0);
        }
    }
    Deno.exit();
}

// you can also use `--location` argument, for example
// `--location https://threejs.org/examples/webgpu_backdrop.html`
if (!location) {
    // TODO: support to pass query params from command arguments
    (window as any).location = {
        search: ''
    };

    // polyfill `fetch` API to use cache

    const is_abs = function (uri: string): boolean {
        return uri.startsWith("http:") || uri.startsWith("https:");
    };

    const is_cachable_url = function (uri: string): boolean {
        return uri.startsWith(THREEJS_RES_BASE_URL) || uri.startsWith(MATERIALX_RES_BASE_URL) || !is_abs(uri);
    }

    // FIXME?: use "examples/jsm" built in three.js instead of fetch it form "https://threejs.org/examples/jsm/".
    const fetch_origin = fetch;
    globalThis.fetch = async function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
        const input_str = input instanceof Request ? input.url : input.toString();
        if (is_cachable_url(input_str)) {
            const data = await load_with_cache(input_str);
            return new Response(data, { status: 200 });
        }
        if (!input_str.startsWith("blob:"))
            console.info(`fetch(${input_str}) without cache`);
        return fetch_origin(input, init);
    };

    class RequestMock extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
            if (typeof input === "string" && !is_abs(input)) {
                input = new URL(input, THREEJS_RES_BASE_URL);
            }
            super(input, init);
        }
    }

    globalThis.Request = RequestMock;

    const THREEJS_RES_BASE_URL = "https://threejs.org/examples/";
    const MATERIALX_RES_BASE_URL = "https://raw.githubusercontent.com/materialx/MaterialX/main/resources/";

    const load_with_cache = async function (uri: string): Promise<ArrayBuffer> {
        // console.log(`loading ${uri}`);
        if (uri.startsWith("blob:")) {
            // BLOB URL
            const res = await fetch_origin(uri);
            if (!res.ok) {
                throw new Error(`fetch ${uri} failed: ${res.status}`);
            }
            return res.arrayBuffer();
        } else if (is_cachable_url(uri)) {
            // load three.js and MaterialX with cache
            let localPath;
            let remotePath;
            if (uri.startsWith(THREEJS_RES_BASE_URL)) {
                remotePath = uri;
                localPath = join(import.meta.dirname!, uri.slice(THREEJS_RES_BASE_URL.length));
            } else if (uri.startsWith(MATERIALX_RES_BASE_URL)) {
                remotePath = uri;
                localPath = join(import.meta.dirname!, "materialx", uri.slice(MATERIALX_RES_BASE_URL.length));
            } else {
                remotePath = new URL(uri, THREEJS_RES_BASE_URL).toString();
                localPath = join(import.meta.dirname!, uri);
            }
            return load_with_cache_abs(remotePath, localPath);
        } else if (is_abs(uri)) {
            // direct fetch
            console.info(`fetch ${uri} without cache`);
            return (await fetch_origin(uri)).arrayBuffer();
        } else {
            throw new Error(`unknow type of uri: ${uri}`);
        }
    }

    const load_with_cache_abs = async function (remotePath: string, localPath: string): Promise<ArrayBuffer> {

        let data: ArrayBuffer;
        if (await fs.exists(localPath)) {
            data = (await Deno.readFile(localPath!)).buffer;
        } else {
            const res = await fetch_origin(remotePath);
            if (!res.ok) {
                throw new Error(`fetch ${remotePath} failed: ${res.status}`);
            }
            data = await res.arrayBuffer();
            await Deno.mkdir(dirname(localPath), { recursive: true });
            await Deno.writeFile(localPath, new Uint8Array(data));
            console.log(`${remotePath} is cached to ${localPath}`);
        }
        return data;
    }
}

const _log_handler = {
    get(obj: any, prop: any) {
        if (prop in obj) {
            return obj[prop];
        } else {
            console.log(`try to get .${String(prop)}`);
        }
    },
    set(obj: any, prop: any, val: any) {
        obj[prop] = val;
        console.log(`try to set .${String(prop)} = ${val}`);
        return true;
    },
};

// deno do not support HTMLImageElement
class Image extends EventTarget {
    nodeType = 1;
    width = 0;
    height = 0;
    _imageData: ImageData | undefined;

    set src(uri: string) {
        // console.log(`loading ${uri}`);
        (async () => {
            const data = await (await fetch(uri)).arrayBuffer();
            const imageData = await loadImageData(data);
            this.width = imageData.width;
            this.height = imageData.height;
            this._imageData = imageData;
            const event = new Event('load');
            this.dispatchEvent(event);
        })();
    }

    getRootNode() {
        return this;
    }

    parentNode() {
        return this;
    }
}

class ElementMock extends EventTarget {
    style = {}
    appendChild(_target?: EventTarget) {
        // TODO: bubble events
    }
    getRootNode() {
        return this;
    }
}

let canvasCount = 0;

// deno do not support document
(globalThis as any).document = {
    createElementNS(_namespaceURI: string, qualifiedName: string) {
        if (qualifiedName === "img") {
            // return new Proxy(new Image(), _log_handler);
            return new Image();
        } else if (qualifiedName === "canvas") {
            canvasCount += 1;
            if (canvasCount > 1) {
                throw new Error("create too many <canvas>");
            }
            return canvasDomMock;
        }

        throw new Error(`Not support to create <${qualifiedName}>`);
    },

    createElement(name: string) {
        console.log(`document.createElement("${name}")`)
        return new ElementMock();
    },

    getElementById(id: string) {
        console.log(`document.getElementById("${id}")`)
        return new ElementMock();
    },

    addEventListener(event: string, _listener: any, _options: any) {
        console.log(`document.addEventListener("${event}", ...)`);
        if (event == "mousemove") {
            canvasDomMock.addEventListener("pointermove", _listener, _options);
        }
    },

    body: {
        appendChild() { }
    }
};

// Deno 2.0 would not support window
if (!globalThis.window)
    globalThis.window = {} as any;
(window as any).innerWidth = WIDTH;
(window as any).innerHeight = HEIGHT;
// TODO: Retina Display?
(window as any).devicePixelRatio = 1;

class WorkerMock extends Worker {
    constructor(specifier: string | URL, options?: WorkerOptions) {
        if (!options) {
            options = { type: "module" };
        }
        super(specifier, options);
    }
}

globalThis.Worker = WorkerMock;

// ----- May be fixed/implemented in the future -----

export async function init(title: string) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error(`init WebGPU failed: adapter is ${adapter}`);
    }

    // feature support
    const features: GPUFeatureName[] = Object.values(gpu_feature_names);
    const supportedFeatures: GPUFeatureName[] = [];
    for (const name of features) {
        if (adapter.features.has(name)) {
            supportedFeatures.push(name);
        }
    }

    device = await adapter.requestDevice({
        requiredFeatures: supportedFeatures,
    });

    const width = WIDTH;
    const height = HEIGHT;

    win = new WindowBuilder(title, width, height).resizable().build();
    surface = win.windowSurface();

    canvasDomMock = new CanvasDomMock(surface, width, height);

    // FIXME: three.js getContext would get error.
    const context = surface.getContext("webgpu");

    contextMock = new GPUCanvasContextMock(context, width, height);

    // FIXME?: runWindowEventLoop must run after threejs codes.
    setTimeout(runWindowEventLoop, 0);
}

class GPUCanvasContextMock implements GPUCanvasContext {
    constructor(
        private context: GPUCanvasContext,
        private width: number,
        private height: number,
    ) { }

    #configuration?: GPUCanvasConfiguration;
    #currentTexture?: GPUTexture;

    configure(configuration: GPUCanvasConfiguration): undefined {
        // FIXME: https://github.com/denoland/deno/issues/23508
        configuration.width = this.width;
        configuration.height = this.height;
        // WORKAROUND: Error: Surface is not configured for presentation
        // see https://github.com/denoland/deno/issues/23509
        if (configuration.alphaMode === "premultiplied") {
            delete configuration.alphaMode;
        }
        this.context.configure(configuration);
        this.#configuration = { ...configuration };
    }

    getCurrentTexture(): GPUTexture {
        // WORKAROUND: context.getCurrentTexture() cannot be invoked twice without present
        // see https://github.com/denoland/deno/issues/24313
        if (!this.#currentTexture || this.#currentTexture.width != this.width || this.#currentTexture.height != this.height) {
            this.#currentTexture?.destroy();
            this.#currentTexture = device.createTexture({
                format: preferredFormat,
                size: [this.width, this.height],
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            })
        }

        currentTextureGot = true;
        return this.#currentTexture;
    }

    unconfigure(): undefined {
        this.context.unconfigure();
    }

    _renderCurrentTexture() {
        // WORKAROUND: Error: Invalid Surface Status
        // see https://github.com/denoland/deno/issues/23407
        let surfaceTexture;
        try {
            surfaceTexture = this.context.getCurrentTexture();
        } catch (_e) {
            // console.error(_e);
            this.context.configure(this.#configuration!);
            surfaceTexture = this.context.getCurrentTexture();
        }

        const cmdEncoder = device.createCommandEncoder();
        const renderPass = cmdEncoder.beginRenderPass({
            colorAttachments: [{
                loadOp: "clear",
                storeOp: "store",
                clearValue: [1, 0, 0, 1],
                view: surfaceTexture.createView(),
            }]
        });
        renderPass.setPipeline(simpleRenderPipeline());
        renderPass.setBindGroup(0, this._bindGroup());
        renderPass.draw(6);
        renderPass.end();
        device.queue.submit([cmdEncoder.finish()]);
    }

    #bindGroup?: GPUBindGroup

    _bindGroup(): GPUBindGroup {
        if (!this.#bindGroup) {
            this.#bindGroup = device.createBindGroup({
                entries: [
                    {
                        binding: 0,
                        resource: this.getCurrentTexture().createView(),
                    }
                ],
                layout: simpleRenderPipeline().getBindGroupLayout(0),
            });
        }
        return this.#bindGroup;
    }

    _resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        if (!this.#configuration)
            return;
        this.#configuration.width = width;
        this.#configuration.height = height;
        contextMock.context.configure(this.#configuration);
        this.#bindGroup = undefined;
    }
}

const simpleShader = /* wgsl */`
@vertex
fn vert_main(@builtin(vertex_index) vindex: u32) -> @builtin(position) vec4f {
    // FIXME: not 'let': The expression may only be indexed by a constant
    var vertexes = array(
        vec2f(-1.0,  1.0),
        vec2f(-1.0, -1.0),
        vec2f( 1.0,  1.0),
        vec2f( 1.0,  1.0),
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
    );
    return vec4<f32>(vertexes[vindex], 0.0, 1.0);
}

@group(0) @binding(0) var ourTexture: texture_2d<f32>;

@fragment
fn frag_main(@builtin(position) frag_coord: vec4f) -> @location(0) vec4<f32> {
    return textureLoad(ourTexture, vec2i(frag_coord.xy), 0);
}
`;

let _simpleRenderPipeline: GPURenderPipeline | undefined;
function simpleRenderPipeline(): GPURenderPipeline {
    if (_simpleRenderPipeline)
        return _simpleRenderPipeline;

    const simpleMoudle = device.createShaderModule({
        code: simpleShader,
    });
    _simpleRenderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: simpleMoudle,
        },
        fragment: {
            module: simpleMoudle,
            targets: [
                {
                    format: preferredFormat,
                },
            ],
        },
    });
    return _simpleRenderPipeline;
}

// TypeScript definitions for WebGPU: https://github.com/gpuweb/types/blob/main/dist/index.d.ts

type GPUImageCopyExternalImageSource =
    | ImageBitmap
    | ImageData
    // | HTMLImageElement
    // | HTMLVideoElement
    // | VideoFrame
    // | HTMLCanvasElement
    // | OffscreenCanvas
    ;

type GPUIntegerCoordinate = number;

interface GPUOrigin2DDict {
    x?: GPUIntegerCoordinate;
    y?: GPUIntegerCoordinate;
}

type GPUOrigin2D =
    | Array<GPUIntegerCoordinate>
    | GPUOrigin2DDict;

interface GPUImageCopyExternalImage {
    source: GPUImageCopyExternalImageSource;
    origin?: GPUOrigin2D;
    flipY?: boolean;
}

interface GPUImageCopyTextureTagged extends GPUImageCopyTexture {
    colorSpace?: PredefinedColorSpace;
    premultipliedAlpha?: boolean;
}

type GPUSize32 =
    number;
type GPUSize64 =
    number;

interface GPUImageDataLayout {
    offset?: GPUSize64;
    bytesPerRow?: GPUSize32;
    rowsPerImage?: GPUSize32;
}

// FIXME: deno do not support copyExternalImageToTexture
// https://github.com/denoland/deno/issues/23576
// const copyExternalImageToTexture_origin = (GPUQueue.prototype as any).copyExternalImageToTexture;
// (GPUQueue.prototype as any).copyExternalImageToTexture = function (
//     source: GPUImageCopyExternalImage,
//     destination: GPUImageCopyTextureTagged,
//     copySize: GPUExtent3D
// ) {
//     if (source.source instanceof ImageBitmap || source.source instanceof ImageData) {
//         copyExternalImageToTexture_origin.call(this, source, destination, copySize);
//     } else if ((source.source as any) instanceof Image) {
//         const imgBmp = (source.source as any)._imageBitmap!;
//         const imgData = new ImageData(new Uint8ClampedArray(getImageBitmapData(imgBmp)), imgBmp.width, imgBmp.height);
//         const newSource = {
//             ...source,
//             source: imgData,
//         };
//         copyExternalImageToTexture_origin.call(this, newSource, destination, copySize);
//     } else {
//         throw new TypeError("not support call GPUQueue.copyExternalImageToTexture with that source");
//     }
// };

(GPUQueue.prototype as any).copyExternalImageToTexture = function (
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    _copySize: GPUExtent3D
) {
    let imgData: BufferSource;
    let width: number;
    let height: number;
    if (source.source instanceof ImageBitmap) {
        imgData = getImageBitmapData(source.source);
        ({ height, width } = source.source);
    } else if (source.source instanceof ImageData) {
        imgData = source.source.data;
        ({ height, width } = source.source);
    } else if ((source.source as any) instanceof Image) {
        imgData = (source.source as any)._imageData.data;
        ({ height, width } = source.source);
    } else {
        throw new TypeError("not support call GPUQueue.copyExternalImageToTexture with that source");
    }

    // suppose to RGBA8 format
    (this as GPUQueue).writeTexture(destination, imgData, {
        offset: 0,
        bytesPerRow: 4 * width,
        rowsPerImage: height,
    }, { width, height });
};

let s_data: symbol;

// HACK: internal deno, because deno do not support decode image.
function getImageBitmapData(bitmap: ImageBitmap) {
    if (s_data === undefined) {
        for (const s of Object.getOwnPropertySymbols(bitmap)) {
            switch (s.description) {
                case "[[bitmapData]]":
                    s_data = s;
                    break;
            }
        }
    }
    return (bitmap as any)[s_data]
}

// FIXME: hook createImageBitmap
const createImageBitmap_origin = globalThis.createImageBitmap;
(globalThis as any).createImageBitmap = async function (image: ImageBitmapSource, options?: ImageBitmapOptions | undefined) {
    // console.log(`createImageBitmap: `, image, options)
    if (options && options.colorSpaceConversion === "none")
        options.colorSpaceConversion = "default"
    if (options && options.premultiplyAlpha !== "default")
        options.premultiplyAlpha = "default"
    if (image instanceof ImageData) {
        return createImageBitmap_origin(image, options);
    } else if (image instanceof Blob) {
        const imgData = await loadImageData(await image.arrayBuffer());
        return createImageBitmap_origin(imgData, options);
    } else {
        throw new Error(`createImageBitmap: unsupported image ${image}`)
    }
};

function startsWith<T>(arr: ArrayLike<T>, prefix: ArrayLike<T>): boolean {
    if (arr.length < prefix.length) {
        return false;
    }
    for (let i = 0; i < prefix.length; ++i) {
        if (arr[i] !== prefix[i]) {
            return false;
        }
    }
    return true;
}

function is_png(u8view: Uint8Array) {
    return startsWith(u8view, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

function is_jpeg(u8view: Uint8Array) {
    return startsWith(u8view, [0xFF, 0xD8, 0xFF]);
}

function is_gif(u8view: Uint8Array) {
    return startsWith(u8view, [0x47, 0x49, 0x46]);
}

async function loadImageData(data: ArrayBuffer): Promise<ImageData> {
    const u8view = new Uint8Array(data);
    if (is_png(u8view) || is_jpeg(u8view)) {
        const { data: image_data, width, height } = await getPixels(data);
        const imgData = new ImageData(new Uint8ClampedArray(image_data), width, height);
        return imgData;
    } else if (is_gif(u8view)) {
        const gif = parseGIF(data);
        const frames = decompressFrames(gif, true);
        const frame0 = frames[0];
        const imgData = new ImageData(frame0.patch, frame0.dims.width, frame0.dims.height);
        return imgData;
    }
    throw new Error("cannot load image data");
}

const reIlligalCast = /[ui]32\(\s*([\d.]+)\s*\)/g;

// FIXME: wgpu or three.js bug
const GPUDevice_createShaderModule_origin = GPUDevice.prototype.createShaderModule;
GPUDevice.prototype.createShaderModule = function (descriptor: GPUShaderModuleDescriptor) {
    if (descriptor.code.search(reIlligalCast) != -1) {
        descriptor.code = descriptor.code.replaceAll(reIlligalCast, (_, n) => Math.trunc(n).toString());
    }
    return GPUDevice_createShaderModule_origin.call(this, descriptor);
};

// FIXME: Deno 1.44.4 device.createRenderPipelineAsync not return a Promise
// see https://github.com/denoland/deno/issues/24317
const GPUDevice_createRenderPipelineAsync_origin = GPUDevice.prototype.createRenderPipelineAsync;
GPUDevice.prototype.createRenderPipelineAsync = function (descriptor: GPURenderPipelineDescriptor) {
    const rp = GPUDevice_createRenderPipelineAsync_origin.call(this, descriptor);
    return Promise.resolve(rp);
}
