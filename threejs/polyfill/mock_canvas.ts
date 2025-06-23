// for canvas.getContext("2d")
import { createCanvas, type Canvas as Canvas2d, type SKRSContext2D, ImageData as ImageData2d } from 'npm:@napi-rs/canvas';

import * as linkedom from "linkedom";
import { currentDevice } from "./hook_webgpu.ts";
import { SimpleDrawer } from "./simple_draw.ts";

let canvasCount = 0;
export let currentContextMock: GPUCanvasContextMock | undefined;
export let onScreenCanvas: CanvasDomMock | undefined;

export class CanvasDomMock extends linkedom.HTMLElement {
    width = 300;
    height = 150;
    _canvas2d: Canvas2d | undefined;
    #gpuTexture: GPUTexture | undefined;

    constructor() {
        super(document, 'canvas');
    }

    static _surface: Deno.UnsafeWindowSurface;

    getContext(name: string) {
        if (name === "webgpu") {
            canvasCount += 1;
            if (canvasCount > 1) {
                throw new Error("create too many WebGPU <canvas>");
            }
            if (!CanvasDomMock._surface) {
                throw new Error("_surface is " + CanvasDomMock._surface);
            }
            onScreenCanvas = this;

            const context = CanvasDomMock._surface.getContext(name);
            currentContextMock = new GPUCanvasContextMock(context);
            return currentContextMock;
        } else if (name === "2d") {
            this._canvas2d = createCanvas(this.width, this.height);
            const ctx = this._canvas2d.getContext(name);
            return hookContext2d(ctx);
        }

        throw new Error(`canvas.getContext("${name}") is not supported`)
    }

    override getBoundingClientRect() {
        return {
            x: 0,
            y: 0,
            bottom: window.innerHeight,
            height: window.innerHeight,
            left: 0,
            right: window.innerWidth,
            top: 0,
            width: window.innerWidth,
        }
    }

    toDataURL(): string {
        if (this._canvas2d) {
            return this._canvas2d.toDataURL();
        }
        throw new Error('toDataURL: only support 2D canvas');
    }

    private get _gpuTexture(): GPUTexture {
        if (!this._canvas2d) {
            throw new Error('_gpuTexture must on a 2d canvas');
        }
        if (!currentDevice) {
            throw new Error('_gpuTexture: no device');
        }
        if (!this.#gpuTexture) {
            this.#gpuTexture = currentDevice.createTexture({
                format: 'rgba8unorm',
                size: [this._canvas2d.width, this._canvas2d.height],
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
                label: 'canvas2d',
            });
        }
        return this.#gpuTexture;
    }

    private _syncGpuTexture(): void {
        if (!this._canvas2d) {
            throw new Error('_syncGpuTexture must on a 2d canvas');
        }
        if (!currentDevice) {
            throw new Error('_syncGpuTexture: no device');
        }
        currentDevice.queue.writeTexture(
            { texture: this._gpuTexture },
            this._canvas2d.data(),
            { bytesPerRow: this._canvas2d.width * 4 },
            [this._canvas2d.width, this._canvas2d.height],
        );
    }

    #drawer: SimpleDrawer | undefined;
    private get _drawer(): SimpleDrawer {
        if (!this.#drawer) {
            if (!currentDevice) {
                throw new Error('_drawer: no device');
            }
            if (!currentContextMock) {
                throw new Error('_drawer: no output context');
            }
            this.#drawer = new SimpleDrawer(currentDevice, this._gpuTexture, currentContextMock.getCurrentTexture().format);
        }
        return this.#drawer;
    }


    static _drawCanvas() {
        if (!currentDevice || !currentContextMock) {
            return;
        }

        for (const c of document.getElementsByTagName('canvas') as CanvasDomMock[]) {
            if (c._canvas2d && c.style.display === 'block') {
                c._syncGpuTexture();
                const dst = currentContextMock.getCurrentTexture();
                const x = parseInt(c.style.left || 0);
                const y = parseInt(c.style.top || 0);
                c._drawer.render(dst, [x, y, c.width, c.height]);
            }
        }
    }
}


let hookContext2d_done = false;
function hookContext2d(ctx: SKRSContext2D) {
    if (hookContext2d_done) {
        return ctx;
    }
    const _drawImage = ctx.drawImage;
    Object.getPrototypeOf(ctx).drawImage = function drawImage(image: unknown, ...args: unknown[]) {
        if (image instanceof HTMLImageElement) {
            const imgData = image._imageData;
            if (imgData) {
                // @ts-ignore: args must have tuple type
                this.putImageData(new ImageData2d(imgData.data, image.width, image.height), ...args);
            } else {
                console.warn("drawImage: image._imageData is undefined");
            }
        } else if (image instanceof CanvasDomMock) {
            if (!image._canvas2d) {
                throw new Error("drawImage: canvas.getContext('2d') is not called");
            }
            // @ts-ignore: args must have tuple type 
            _drawImage.call(this, image._canvas2d, ...args);
        } else {
            console.warn(`drawImage: try to call with image: ${getTypeName(image)}, args: ${args}`);
            // @ts-ignore: args must have tuple type
            _drawImage.call(this, image, ...args);
        }
    }
    hookContext2d_done = true;
    return ctx;
}

function getTypeName(v: unknown): string {
    if (typeof v === 'object') {
        return Object.getPrototypeOf(v).constructor.name
    }
    return typeof v;
}

class GPUCanvasContextMock implements GPUCanvasContext {
    constructor(context: GPUCanvasContext) {
        this.#context = context;
    }

    #context: GPUCanvasContext;
    #configuration?: GPUCanvasConfiguration;
    // avoid present without draw
    _currentTextureGot = false;

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
        this._currentTextureGot = true;
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

    _present() {
        if (this._currentTextureGot) {
            CanvasDomMock._surface.present();
            this._currentTextureGot = false;
        }
    }
}
