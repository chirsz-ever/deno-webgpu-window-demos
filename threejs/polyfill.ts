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

let win: Window;
let device: GPUDevice;
let surface: Deno.UnsafeWindowSurface;

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

    const canvasDomMock = {
        style: {},
        // TODO: implement or polyfill the event system
        addEventListener(event: string, ..._args: any[]) {
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
        surface,
    }
}

type FrameRequestCallback = (time: number) => void;

let requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
    // console.trace("window.requestAnimationFrame()");
    requestAnimationFrameCallbacks.push(callback);
}

const VALIDATION = Deno.args[0] == "--enable-validation";

export async function runWindowEventLoop() {
    // TODO: Handle mouse and keyboard events, handle window resize event
    for await (const event of win.events()) {
        if (event.type === EventType.Quit) break;
        else if (event.type === EventType.KeyDown) {
            if (getKeyName(event.keysym.sym) === "Escape") {
                break;
            }
            continue;
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
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
}