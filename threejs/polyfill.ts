// deno-lint-ignore-file no-explicit-any

import { join, dirname } from "std/path/mod.ts"
import * as fs from "std/fs/mod.ts"

import {
    EventType,
    WindowBuilder,
    getKeyName,
    Window,
} from "deno_sdl2";

type InitParams = {
    title: string,
    width: number,
    height: number,
};

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

const ignoredEvents = [
    "pointerdown", "pointermove", "pointerup"
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
        if (!ignoredEvents.includes(event))
            console.info(`canvas.addEventListener("${event}", ...)`)
    }

    getRootNode() {
        console.info(`canvas.getRootNode()`);
        return this;
    }

    getContext(name: string) {
        console.info(`canvas.getContext("${name}")`);
        return this.canvas.getContext(name as any);
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

let win: Window;
let device: GPUDevice;
let surface: Deno.UnsafeWindowSurface;
let canvasDomMock: CanvasDomMock;

export async function init(params: InitParams) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error(`init WebGPU failed: adapter is ${adapter}`);
    }

    device = await adapter.requestDevice();

    const width = params.width;
    const height = params.height;

    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat();

    win = new WindowBuilder(params.title, width, height).build();
    surface = win.windowSurface();
    const context = surface.getContext("webgpu")
    context.configure({
        device,
        format: surfaceFormat,
        width,
        height,
    })

    canvasDomMock = new CanvasDomMock(surface, width, height);

    const contextMock = {
        configure(configuration: GPUCanvasConfiguration) {
            configuration.width = width;
            configuration.height = height;
            // FIXME: https://github.com/denoland/deno/issues/23509
            if (configuration.alphaMode === "premultiplied") {
                configuration.alphaMode = "opaque";
            }
            context.configure(configuration);
        },
        getCurrentTexture() {
            return context.getCurrentTexture();
        },
        unconfigure() {
            context.unconfigure();
        }
    }

    return {
        device,
        context: contextMock,
        canvas: canvasDomMock,
    }
}

type FrameRequestCallback = (time: number) => void;

let requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
    // console.trace("window.requestAnimationFrame()");
    requestAnimationFrameCallbacks.push(callback);
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

            const currentCallbacks = requestAnimationFrameCallbacks;
            requestAnimationFrameCallbacks = [];
            while (currentCallbacks.length != 0) {
                const callback = currentCallbacks.pop();
                // FIXME: pass exact time
                callback!(0);
                surface.present();
            }

            if (VALIDATION)
                device.popErrorScope().then((error) => {
                    if (error)
                        console.error(`WebGPU validation error: ${error?.message}`);
                });

            // FIXME: deno_sdl2 UI events would block network events?
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
}

export async function loadModel(loader: any,
    path: string,
    onLoad: (gltf: unknown) => void,
    onPorgress?: (_: any) => void,
    onError?: (_: any) => void) {
    const localPath = join(import.meta.dirname!, path);
    const remotePath = "https://threejs.org/examples/" + path;
    let model_data: ArrayBuffer;
    if (await fs.exists(localPath)) {
        model_data = (await Deno.readFile(localPath)).buffer;
    } else {
        const res = await fetch(remotePath);
        model_data = await res.arrayBuffer();
        Deno.mkdir(dirname(localPath), { recursive: true });
        Deno.writeFile(localPath, new Uint8Array(model_data));
        console.log(`${remotePath} is cached to ${localPath}`);
    }
    loader.parse(model_data, dirname(remotePath), onLoad, onPorgress, onError)
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
const copyExternalImageToTexture_origin = (GPUQueue.prototype as any).copyExternalImageToTexture;
(GPUQueue.prototype as any).copyExternalImageToTexture = function (
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    copySize: GPUExtent3D
) {
    if (source.source instanceof ImageBitmap || source.source instanceof ImageData) {
        copyExternalImageToTexture_origin.call(this, source, destination, copySize);
    } else if ((source.source as any) instanceof Image) {
        const imgBmp = (source.source as any)._imageBitmap!;
        const imgData = new ImageData(new Uint8ClampedArray(getImageBitmapData(imgBmp)), imgBmp.height, imgBmp.width);
        const newSource = {
            ...source,
            source: imgData,
        };
        copyExternalImageToTexture_origin.call(this, newSource, destination, copySize);
    } else {
        throw new TypeError("not support call GPUQueue.copyExternalImageToTexture with that source");
    }
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

const log_handler = {
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
    _imageBitmap: ImageBitmap | undefined;

    set src(uri: string) {
        console.log(`loading ${uri}`);
        let mime_type;
        if (uri.endsWith(".jpg") || uri.endsWith(".jpeg")) {
            mime_type = "image/jpeg";
        } else if (uri.endsWith(".png")) {
            mime_type = "image/png";
        } else {
            throw new Error("can not load " + uri);
        }
        const cachePath = join(import.meta.dirname!, uri);
        const localPath = cachePath;
        const remotePath = new URL(uri, "https://threejs.org/examples/");
        (async () => {
            let data: ArrayBuffer;
            if (await fs.exists(localPath)) {
                data = (await Deno.readFile(localPath)).buffer;
            } else {
                const res = await fetch(remotePath);
                data = await res.arrayBuffer();
                Deno.mkdir(dirname(cachePath), { recursive: true });
                Deno.writeFile(cachePath, new Uint8Array(data));
                console.log(`${remotePath} is cached to ${cachePath}`);
            }
            const bitmap = await createImageBitmap(new Blob([data], { type: mime_type }));
            this.width = bitmap.width;
            this.height = bitmap.height;
            this._imageBitmap = bitmap;
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

// deno do not support document
(globalThis as any).document = {
    createElementNS(_namespaceURI: string, qualifiedName: string) {
        if (qualifiedName !== "img") {
            throw new Error(`Not support to create <${qualifiedName}>`);
        }
        // return new Proxy(new Image(), log_handler);
        return new Image();
    },

    body: {
        appendChild() { }
    }
}
