// deno-lint-ignore-file no-explicit-any require-await

import { join, dirname } from "jsr:@std/path@1.0"
import * as fs from "jsr:@std/fs@1.0"
import { getPixels } from "https://deno.land/x/get_pixels@v1.2.2/mod.ts";
import { parseGIF, decompressFrames } from "npm:gifuct-js@2.1.2"

import {
    EventType,
    WindowBuilder,
    getKeyName,
    Window as SDLWindow,
} from "deno_sdl2";

import { GPUFeatureName as gpu_feature_names } from 'three/src/renderers/webgpu/utils/WebGPUConstants.js';

import { WebGPURenderer } from "three";

// for load MaterialX
import { DOMParser, HTMLElement, HTMLImageElement, parseHTML } from "npm:linkedom@0.18.4";
(globalThis as any).DOMParser = DOMParser;

const htmlPage = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const window = htmlPage.window;
const Event = htmlPage.Event;

// Deno 1.x has `window`, no `process`, be treated as web broswer environment.
// Deno 2.x has no `window`, but has `process`, be treated as Node.js environment.
//   but Deno 2.x does not have `require` ...
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
{
    const fn = KTX2Loader.BasisWorker.toString();
    const newFn = fn.substring(0, fn.lastIndexOf('}')) +
        ';delete globalThis.process;' +
        fn.substring(fn.lastIndexOf('}'));
    (KTX2Loader as any).BasisWorker = newFn;
}

const INIT_WIDTH = 1000;
const INIT_HEIGHT = 750;

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

    // TODO: options
    constructor(name: string, _options?: undefined) {
        super(name, { bubbles: true })
    }
}

class WheelEvent extends MouseEvent {
    deltaMode: number;
    deltaX: number = 0;
    deltaY: number = 0;
    deltaZ: number = 0;
    DOM_DELTA_PIXEL = 0x00;
    DOM_DELTA_LINE = 0x01;
    DOM_DELTA_PAGE = 0x02;

    // TODO: options
    constructor(name: string, _options?: undefined) {
        super(name, _options);
        this.deltaMode = this.DOM_DELTA_PIXEL;
    }
}

const _ignoredEvents = [
    "pointerdown", "pointermove", "pointerup", "wheel"
];

class CanvasDomMock extends HTMLElement {
    constructor(private surface: Deno.UnsafeWindowSurface) {
        super(document, 'canvas');
    }

    getContext(name: string) {
        if (name !== "webgpu") {
            throw new Error(`canvas.getContext("${name}") is not supported`)
        }

        const context = this.surface.getContext(name);
        currentContextMock = new GPUCanvasContextMock(context);
        return currentContextMock;
    }
}

let lastMousePos: undefined | { x: number, y: number };

function setMouseEventXY(evt: MouseEvent, x: number, y: number, isMove = false) {
    evt.pageX = evt.offsetX = evt.screenX = evt.clientX = evt.x = x;
    evt.pageY = evt.offsetY = evt.screenY = evt.clientY = evt.y = y;

    evt.movementX = lastMousePos ? evt.screenX - lastMousePos.x : 0;
    evt.movementY = lastMousePos ? evt.screenY - lastMousePos.y : 0;

    if (isMove) {
        if (!lastMousePos) {
            lastMousePos = { x: evt.screenX, y: evt.screenY };
        }
        lastMousePos.x = evt.screenX;
        lastMousePos.y = evt.screenY;
    }
}

let currentDevice: GPUDevice | undefined;
let currentContextMock: GPUCanvasContextMock | undefined;

// make Three.js always use our mocked objects
WebGPURenderer.prototype.init = async function init() {
    return Object.getPrototypeOf(WebGPURenderer.prototype).init.call(this).then((renderer: WebGPURenderer) => {
        currentDevice = this.backend.device;
        return renderer;
    });
}

let win: SDLWindow;
let surface: Deno.UnsafeWindowSurface;
let canvasDomMock: CanvasDomMock;

type FrameRequestCallback = (time: number) => void;

let requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
    // console.trace("window.requestAnimationFrame()");
    requestAnimationFrameCallbacks.push(callback);
}

function sleep(timeout: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeout))
}

const VALIDATION = !Deno.args.includes("--disable-validation");

let button0 = 0;

// avoid preset twice
let currentTextureGot = false;

// disapth both mouse/pointer events
function dispatchPointerEvent(typ: string, x: number, y: number, buttons: number) {
    const evtP = new MouseEvent("pointer" + typ);
    setMouseEventXY(evtP, x, y, typ === "move");
    evtP.buttons = buttons;
    canvasDomMock.dispatchEvent(evtP);

    const evtM = new MouseEvent("mouse" + typ);
    setMouseEventXY(evtM, x, y);
    evtM.movementX = evtP.movementX;
    evtM.movementY = evtP.movementY;
    evtM.buttons = buttons;
    canvasDomMock.dispatchEvent(evtM);
}

export async function runWindowEventLoop() {
    // TODO: Handle keyboard events
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
            dispatchPointerEvent("down", event.x, event.y, 1);
            button0 = 1;
        } else if (event.type == EventType.MouseButtonUp) {
            dispatchPointerEvent("up", event.x, event.y, 0);
            button0 = 0;
        } else if (event.type == EventType.MouseMotion) {
            dispatchPointerEvent("move", event.x, event.y, button0);
        } else if (event.type == EventType.MouseWheel) {
            const evt = new WheelEvent("wheel");
            evt.deltaX = event.x * 120;
            evt.deltaY = event.y * 120;
            evt.deltaMode = evt.DOM_DELTA_PIXEL;
            setMouseEventXY(evt, lastMousePos?.x ?? 0, lastMousePos?.y ?? 0);
            canvasDomMock.dispatchEvent(evt);
        }
        else if (event.type === EventType.WindowEvent) {
            switch (event.event) {
                // FIXME: resize not work on Linux
                // SDL_WINDOWEVENT_SIZE_CHANGED
                case 6: {
                    // console.info(`resize(${event.data1}, ${event.data2})`);
                    const new_width = event.data1;
                    const new_height = event.data2;
                    (window as any).innerWidth = new_width;
                    (window as any).innerHeight = new_height;
                    surface = win.windowSurface(new_width, new_height);
                    const context = surface.getContext("webgpu");
                    currentContextMock?._setContext(context);
                    currentContextMock?._reconfigure();

                    requestAnimationFrameCallbacks.unshift(() => {
                        (window).dispatchEvent(new Event("resize"));
                    });
                }
            }
        }
        else if (event.type === EventType.Draw) {

            if (requestAnimationFrameCallbacks.length > 0) {
                if (VALIDATION)
                    currentDevice?.pushErrorScope("validation");

                const currentCallbacks = requestAnimationFrameCallbacks;
                requestAnimationFrameCallbacks = [];
                const t = performance.now();
                while (currentCallbacks.length != 0) {
                    const callback = currentCallbacks.shift();
                    callback!(t);
                }

                if (currentTextureGot) {
                    surface.present();
                    currentTextureGot = false;
                }

                if (VALIDATION) {
                    currentDevice?.popErrorScope().then((error) => {
                        if (error) {
                            console.error(`WebGPU validation error: ${error.message}`);
                            Deno.exit(1);
                        }
                    });
                }
            }

            // FIXME: deno_sdl2 UI events would block network events?
            await sleep(0);
        }
    }
    Deno.exit();
}

// window global is not available in Deno 2
if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = window;
}

// you can also use `--location` argument, for example
// `--location https://threejs.org/examples/webgpu_backdrop.html`
if (!location) {
    // TODO: support to pass query params from command arguments
    (window as any).location = {
        search: ''
    };

    // mock `fetch` API to use cache

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
            // https://docs.deno.com/runtime/reference/web_platform_apis/#fetching-local-files
            // > No headers are set on the response. Therefore it is up to the consumer to determine things like the content type or content length.
            const ctype = input_str.endsWith(".jpg") ? "image/jpeg" : input_str.endsWith(".png") ? "image/png" : input_str.endsWith(".gif") ? "image/gif" : undefined;
            // console.info(`fetch("${input_str}"): content-type: ${ctype}`);
            const headers = ctype ? { "content-type": ctype } : undefined;
            return new Response(data, { status: 200, headers });
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
    const THREEJS_RES_BASE_URL_POLYFILL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r175/examples/";
    const MATERIALX_RES_BASE_URL = "https://raw.githubusercontent.com/materialx/MaterialX/main/resources/";
    const MATERIALX_RES_BASE_URL_POLYFILL = "https://cdn.jsdelivr.net/gh/materialx/MaterialX@1.39/resources/";

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
            let localPath: string;
            let remotePath: string;
            let subpath: string;
            if (uri.startsWith(THREEJS_RES_BASE_URL)) {
                subpath = uri.slice(THREEJS_RES_BASE_URL.length);
                remotePath = new URL(subpath, THREEJS_RES_BASE_URL_POLYFILL).toString();
                localPath = join(import.meta.dirname!, subpath);
            } else if (uri.startsWith(MATERIALX_RES_BASE_URL)) {
                subpath = uri.slice(MATERIALX_RES_BASE_URL.length);
                remotePath = new URL(subpath, MATERIALX_RES_BASE_URL_POLYFILL).toString();
                localPath = join(import.meta.dirname!, "materialx", subpath);
            } else {
                remotePath = new URL(uri, THREEJS_RES_BASE_URL_POLYFILL).toString();
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
            console.info(`fetch ${remotePath}`);
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
class Image extends HTMLImageElement {
    _imageData: ImageData | undefined;

    constructor(width?: number, height?: number) {
        super(document, "img");
        if (width !== undefined) {
            super.width = width;
        }
        if (height !== undefined) {
            super.height = height;
        }
    }

    override set src(uri: string) {
        // console.log(`loading ${uri}`);
        super.src = uri;
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
}

// deno do not support document
const document = (globalThis as any).document = (htmlPage as any).document;

let canvasCount = 0;

document.createElementNS = function createElementNS(_namespaceURI: string, qualifiedName: string) {
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
};

// document.createElement = function createElement(tagName: string) {
//     // console.log(`document.createElement("${tagName}")`)
//     return Object.getPrototypeOf(document).createElement.apply(this, arguments);
// };

document.getElementById = function getElementById(id: string) {
    console.log(`document.getElementById("${id}")`)
    let elm = Object.getPrototypeOf(document).getElementById.apply(this, arguments);
    if (!elm) {
        elm = document.createElement('div')
        elm.id = id;
    }
    return elm;
};

// FIXME: linkedom bug? cannot set innerHTML with number
Object.defineProperty(HTMLElement.prototype, 'innerHTML', {
    set() {
        // do nothing
    }
});

// linkedom do not support these methods
(HTMLElement.prototype as any).setPointerCapture = function setPointerCapture() {
    // console.info(`canvas.setPointerCapture()`);
};

(HTMLElement.prototype as any).releasePointerCapture = function releasePointerCapture() {
    // console.info(`canvas.releasePointerCapture()`);
};

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    get: () => (window as any).innerHeight,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    get: () => (window as any).innerWidth,
});

(window as any).innerWidth = INIT_WIDTH;
(window as any).innerHeight = INIT_HEIGHT;
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
    const features: GPUFeatureName[] = Object.values(gpu_feature_names) as GPUFeatureName[];
    const supportedFeatures: GPUFeatureName[] = [];
    for (const name of features) {
        if (adapter.features.has(name)) {
            supportedFeatures.push(name);
        }
    }

    const width = INIT_WIDTH;
    const height = INIT_HEIGHT;

    win = new WindowBuilder(title, width, height).resizable().build();
    surface = win.windowSurface(width, height);

    canvasDomMock = new CanvasDomMock(surface);

    // FIXME?: runWindowEventLoop must run after threejs codes.
    setTimeout(runWindowEventLoop, 0);
}

class GPUCanvasContextMock implements GPUCanvasContext {
    constructor(context: GPUCanvasContext) {
        this.#context = context;
    }

    #context: GPUCanvasContext;
    #configuration?: GPUCanvasConfiguration;

    configure(configuration: GPUCanvasConfiguration): undefined {
        // WORKAROUND: Error: Surface is not configured for presentation
        // see https://github.com/denoland/deno/issues/23509
        if (configuration.alphaMode === "premultiplied") {
            delete configuration.alphaMode;
        }
        this.#context.configure(configuration);
        this.#configuration = { ...configuration };
    }

    getCurrentTexture(): GPUTexture {
        currentTextureGot = true;
        return this.#context.getCurrentTexture();
    }

    unconfigure(): undefined {
        this.#context.unconfigure();
        this.#configuration = undefined;
    }

    _reconfigure() {
        if (this.#configuration) {
            this.#context.configure(this.#configuration);
        }
    }

    _setContext(context: GPUCanvasContext) {
        this.#context = context;
    }
}

// TypeScript definitions for WebGPU: https://github.com/gpuweb/types/blob/main/dist/index.d.ts

type GPUImageCopyExternalImageSource =
    | ImageBitmap
    | ImageData
    | HTMLImageElement
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

interface GPUImageCopyTextureTagged extends GPUTexelCopyTextureInfo {
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
(GPUQueue.prototype as any).copyExternalImageToTexture = function (
    this: GPUQueue,
    sourceOptions: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    _copySize: GPUExtent3D
) {
    // TODO: handle rgba8unorm-srgb
    let imgData: Uint8ClampedArray | Uint8Array;
    let width: number;
    let height: number;
    const source = sourceOptions.source;
    if (source instanceof ImageBitmap) {
        // Maybe other types, such as RGB8
        imgData = getImageBitmapData(source);
        ({ height, width } = source);
    } else if (source instanceof ImageData) {
        // RGBA8
        imgData = source.data;
        ({ height, width } = source);
    } else if (source instanceof Image) {
        // RGBA8
        imgData = (source as any)._imageData.data as Uint8ClampedArray;
        ({ height, width } = source);
    } else {
        throw new TypeError("not support call GPUQueue.copyExternalImageToTexture with that source");
    }

    if (imgData.length !== 4 * width * height) {
        if (imgData.length === 3 * width * height) {
            // Hack: RGB8 -> RGBA8
            const newData = new Uint8Array(4 * width * height);
            for (let i = 0; i < width * height; i++) {
                const b = i * 3;
                const a = i * 4;
                newData[a + 3] = 255;
                newData[a + 0] = imgData[b + 0];
                newData[a + 1] = imgData[b + 1];
                newData[a + 2] = imgData[b + 2];
            }
            imgData = newData;
        } else {
            throw new Error(`copyExternalImageToTexture: imgData: length: ${imgData.length}, width: ${width}, height: ${height}`);
        }
    }

    // suppose to RGBA8 format
    this.writeTexture(destination, imgData, {
        offset: 0,
        bytesPerRow: 4 * width,
        rowsPerImage: height,
    }, { width, height });
};

// https://github.com/denoland/deno/issues/28521
if (typeof GPUDevice.prototype.lost === 'undefined') {
    (GPUDevice.prototype as any).lost = new Promise(() => { });
}

let s_data: symbol;

// HACK: internal deno, because deno do not support decode image.
function getImageBitmapData(bitmap: ImageBitmap): Uint8Array {
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

// https://github.com/denoland/deno/issues/28723
const createImageBitmap_origin = globalThis.createImageBitmap;
(globalThis as any).createImageBitmap = async function (image: ImageBitmapSource, ...args: any[]) {
    if (image instanceof Blob) {
        if (image.type)
            return createImageBitmap_origin(image, ...args);

        const buffer = await image.arrayBuffer();
        const u8view = new Uint8Array(buffer);
        const ctype = is_png(u8view) ? 'image/png' : is_jpeg(u8view) ? 'image/jpeg' : is_gif(u8view) ? 'image/gif' : undefined;
        // console.info(`createImageBitmap: detect content-type: ${ctype}`)
        if (!ctype)
            return createImageBitmap_origin(image, ...args);

        const newBlob = image.slice(0, image.size, ctype);
        return createImageBitmap_origin(newBlob, ...args);
    }

    return createImageBitmap_origin(image, ...args);
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

const reIlligalCast = /[ui]32\(\s*([\d.]+)u?\s*\)/g;
// FIXME
const patEnableSubgroup = 'enable subgroups;';

// FIXME: wgpu or three.js bug
const GPUDevice_createShaderModule_origin = GPUDevice.prototype.createShaderModule;
GPUDevice.prototype.createShaderModule = function (descriptor: GPUShaderModuleDescriptor) {
    if (descriptor.code.search(reIlligalCast) != -1) {
        descriptor.code = descriptor.code.replaceAll(reIlligalCast, (_, n) => Math.trunc(n).toString());
    }
    // https://github.com/gfx-rs/wgpu/issues/7471
    if (descriptor.code.search(patEnableSubgroup) != -1) {
        descriptor.code = descriptor.code.replaceAll(patEnableSubgroup, '');
    }
    return GPUDevice_createShaderModule_origin.call(this, descriptor);
};
