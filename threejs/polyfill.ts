// deno-lint-ignore-file no-explicit-any

import { join, dirname } from "std/path/mod.ts"
import * as fs from "std/fs/mod.ts"
import { getPixels } from "https://deno.land/x/get_pixels@v1.2.2/mod.ts";

import {
    EventType,
    WindowBuilder,
    getKeyName,
    Window,
} from "deno_sdl2";

import WebGPUBackend from 'three/addons/renderers/webgpu/WebGPUBackend.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { FileLoader } from 'three';

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

export async function runWindowEventLoop() {
    // TODO: Handle mouse and keyboard events, handle window resize event
    for await (const event of win.events()) {
        if (event.type === EventType.Quit) {
            break;
        } else if (event.type === EventType.KeyDown) {
            if (getKeyName(event.keysym.sym) === "Escape") {
                break;
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
        // else if (event.type === EventType.WindowEvent) {
        //     switch (event.event) {
        //         case 5: // SDL_WINDOWEVENT_RESIZED
        //             console.info("resized!")
        //             onWindowResize(event.data1, event.data2)
        //             continue;
        //     }
        // }
        else if (event.type === EventType.Draw) {

            if (VALIDATION)
                device.pushErrorScope("validation");

            if (requestAnimationFrameCallbacks.length != 0) {
                const currentCallbacks = requestAnimationFrameCallbacks;
                requestAnimationFrameCallbacks = [];
                const t = performance.now();
                while (currentCallbacks.length != 0) {
                    const callback = currentCallbacks.pop();
                    callback!(t);
                }
                // WORKAROUND:
                // in every frame, the processing must be:
                //
                // context.getCurrentTexture()
                // // ...
                // surface.present()
                //
                // so we need wait here for calling getCurrentTexture()
                await sleep(0);
                surface.present();
            }

            if (VALIDATION)
                device.popErrorScope().then((error) => {
                    if (error)
                        console.error(`WebGPU validation error: ${error?.message}`);
                });

            // FIXME: deno_sdl2 UI events would block network events?
            await sleep(0);
        }
    }
}

const BASE_URL = "https://threejs.org/examples/";

async function load_with_cache(uri: string): Promise<ArrayBuffer> {
    // console.log(`loading ${uri}`);
    const relative_uri = uri.startsWith(BASE_URL) ? uri.slice(BASE_URL.length) : uri;
    const localPath = join(import.meta.dirname!, relative_uri);
    const remotePath = BASE_URL + relative_uri;
    let data: ArrayBuffer;
    if (await fs.exists(localPath)) {
        data = (await Deno.readFile(localPath)).buffer;
    } else {
        const res = await fetch(remotePath);
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

GLTFLoader.prototype.load = async function (uri: string, ...args: any[]) {
    const full_uri = join(this.path, uri);
    const model_data = await load_with_cache(full_uri);
    this.parse(model_data, dirname(BASE_URL + full_uri) + "/", ...args);
};

const decoder = new TextDecoder();

FontLoader.prototype.load = async function (uri: string, onLoad: any) {
    const font_data = await load_with_cache(uri);
    const font = this.parse(JSON.parse(decoder.decode(font_data)));
    onLoad(font);
};

FileLoader.prototype.load = async function (uri: string, onLoad: any) {
    const full_uri = this.path ? join(this.path, uri) : uri;
    const data = await load_with_cache(full_uri);
    if (uri.endsWith(".json")) {
        const s = decoder.decode(data);
        onLoad(s);
    } else {
        onLoad(data);
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
        const cachePath = join(import.meta.dirname!, uri);
        const localPath = cachePath;
        const remotePath = new URL(uri, "https://threejs.org/examples/");
        (async () => {
            let data: ArrayBuffer;
            if (await fs.exists(localPath)) {
                data = (await Deno.readFile(localPath)).buffer;
            } else {
                const res = await fetch(remotePath);
                if (!res.ok) {
                    throw new Error(`fetch ${remotePath} failed: ${res.status}`);
                }
                data = await res.arrayBuffer();
                await Deno.mkdir(dirname(cachePath), { recursive: true });
                await Deno.writeFile(cachePath, new Uint8Array(data));
                console.log(`${remotePath} is cached to ${cachePath}`);
            }
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
    appendChild() { }
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
// TODO: window.addEventListener

// ----- May be fixed/implemented in the future -----

export async function init(title: string) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error(`init WebGPU failed: adapter is ${adapter}`);
    }

    device = await adapter.requestDevice();

    const width = WIDTH;
    const height = HEIGHT;

    win = new WindowBuilder(title, width, height).build();
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
        // WORKAROUND: Error: Invalid Surface Status
        // see https://github.com/denoland/deno/issues/23407
        try {
            return this.context.getCurrentTexture();
        } catch (_e) {
            // console.error(_e);
            this.context.configure(this.#configuration!);
        }
        return this.context.getCurrentTexture();
    }

    unconfigure(): undefined {
        this.context.unconfigure();
    }
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

async function loadImageData(data: ArrayBuffer): Promise<ImageData> {
    const { data: image_data, width, height } = await getPixels(data);
    const imgData = new ImageData(new Uint8ClampedArray(image_data), width, height);
    return imgData;
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
