// deno-lint-ignore-file no-explicit-any
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
        if (event.type === EventType.Quit) break;
        else if (event.type === EventType.KeyDown) {
            if (getKeyName(event.keysym.sym) === "Escape") {
                break;
            }
            continue;
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
        else if (event.type !== EventType.Draw) continue;

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
