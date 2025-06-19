import {
    EventType,
    WindowBuilder,
    Window as SDLWindow,
} from "deno_sdl2";

import './hook_fetch.ts';
import './hook_image_data.ts';
import { currentDevice } from "./hook_webgpu.ts";
import { CanvasDomMock, currentContextMock } from "./mock_canvas.ts";
import { requestAnimationFrameCallbacks } from "./mock_dom.ts";
import { processUserInput } from "./pass_user_input.ts";

const INIT_WIDTH = 1000;
const INIT_HEIGHT = 750;

let win: SDLWindow;
let surface: Deno.UnsafeWindowSurface;

function sleep(timeout: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeout))
}

const VALIDATION = !Deno.args.includes("--disable-validation");

// TODO: draw the dom by traversing it. show stats-gl and ili-gui, handle the inputs.
export async function runWindowEventLoop() {
    let resize_pending = false;
    let size_changed = false;
    for await (const event of win.events()) {
        if (event.type === EventType.Quit) {
            break;
        } else if (processUserInput(event)) {
            continue;
        } else if (event.type === EventType.WindowEvent) {
            switch (event.event) {
                // SDL_WINDOWEVENT_SIZE_CHANGED
                case 6: {
                    // console.info(`resize(${event.data1}, ${event.data2})`);
                    const new_width = event.data1;
                    const new_height = event.data2;
                    window.innerWidth = new_width;
                    window.innerHeight = new_height;
                    surface.resize(new_width, new_height);
                    resize_pending = true;
                    size_changed = true;
                }
            }
        } else if (event.type === EventType.Draw) {
            // skip the first next draw event after a resize event
            // workaround for Error on X11
            if (resize_pending) {
                resize_pending = false;
                continue;
            }

            if (size_changed) {
                size_changed = false;
                requestAnimationFrameCallbacks.unshift(() => {
                    (window).dispatchEvent(new Event("resize"));
                });
            }

            if (requestAnimationFrameCallbacks.length > 0) {
                if (VALIDATION)
                    currentDevice?.pushErrorScope("validation");

                const currentCallbacks = [...requestAnimationFrameCallbacks];
                requestAnimationFrameCallbacks.length = 0;
                const t = performance.now();
                while (currentCallbacks.length != 0) {
                    const callback = currentCallbacks.shift();
                    callback!(t);
                }

                CanvasDomMock._drawCanvas();

                currentContextMock?._present();

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

export async function init(title: string) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error(`init WebGPU failed: adapter is ${adapter}`);
    }

    const width = INIT_WIDTH;
    const height = INIT_HEIGHT;

    win = new WindowBuilder(title, width, height).resizable().build();
    surface = win.windowSurface(width, height);

    window.innerWidth = INIT_WIDTH;
    window.innerHeight = INIT_HEIGHT;

    CanvasDomMock._surface = surface;

    // FIXME?: runWindowEventLoop must run after threejs codes.
    // webgpu_morphtargets_face.js
    setTimeout(runWindowEventLoop, 0);
}

// short mock for worker
class WorkerMock extends Worker {
    constructor(specifier: string | URL, options?: WorkerOptions) {
        if (!options) {
            options = { type: "module" };
        }
        super(specifier, options);
    }
}

globalThis.Worker = WorkerMock;
