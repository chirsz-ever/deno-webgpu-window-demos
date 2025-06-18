import * as linkedom from "linkedom";

import { CanvasDomMock, onScreenCanvas } from "./mock_canvas.ts";
import { loadImageData } from "./hook_image_data.ts";

declare global {
    var DOMParser: typeof linkedom.DOMParser;
    type DOMParser = linkedom.DOMParser;

    var HTMLElement: typeof linkedom.HTMLElement;
    type HTMLElement = linkedom.HTMLElement;

    var HTMLImageElement: typeof linkedom.HTMLImageElement;
    type HTMLImageElement = linkedom.HTMLImageElement;

    var HTMLCanvasElement: typeof CanvasDomMock;
    type HTMLCanvasElement = CanvasDomMock;

    var Image: typeof linkedom.HTMLImageElement;

    var window: Window;
    // deno-lint-ignore no-explicit-any
    var document: any;

    var devicePixelRatio: number;

    function requestAnimationFrame(callback: FrameRequestCallback): number;
    // function cancelAnimationFrame(_: number): void;
}

globalThis.DOMParser = linkedom.DOMParser;
globalThis.HTMLElement = linkedom.HTMLElement;
globalThis.HTMLImageElement = linkedom.HTMLImageElement;

// global window is not available in Deno 2
export const htmlPage = linkedom.parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
globalThis.window = htmlPage.window;
globalThis.document = htmlPage.window.document;
globalThis.Image = window.Image;

type FrameRequestCallback = (time: number) => void;
export const requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    // console.trace("window.requestAnimationFrame()");
    requestAnimationFrameCallbacks.push(callback);
    return 0;
}

document.createElementNS = function createElementNS(_namespaceURI: string, qualifiedName: string) {
    if (qualifiedName === "canvas") {
        return new CanvasDomMock();
    }
    // if (!['div', 'img'].includes(qualifiedName)) {
    //     console.log(`document.createElementNS("${_namespaceURI}", "${qualifiedName}")`)
    // }
    return Object.getPrototypeOf(document).createElementNS.apply(this, arguments);
};

document.createElement = function createElement(tagName: string) {
    if (tagName === "canvas") {
        return new CanvasDomMock();
    }
    // if (!['div', 'img'].includes(tagName)) {
    //     console.log(`document.createElement("${tagName}")`)
    // }
    return Object.getPrototypeOf(document).createElement.apply(this, arguments);
};

document.getElementById = function getElementById(id: string) {
    // console.log(`document.getElementById("${id}")`)
    // HACK for webgpu_tsl_interoperability
    if (id === 'c') {
        return onScreenCanvas;
    }
    let elm = Object.getPrototypeOf(document).getElementById.apply(this, arguments);
    if (!elm) {
        elm = document.createElement('div')
        elm.id = id;
    }
    return elm;
};

declare module "linkedom" {
    interface HTMLElement {
        innerHTML: string;
        innerText: string;

        setPointerCapture(pointerId: number): void;
        releasePointerCapture(pointerId: number): void;

        clientHeight: number;
        clientWidth: number;
    }

    interface HTMLImageElement {
        _imageData: ImageData | undefined;
    }
}

declare global {
    interface Window {
        innerWidth: number;
        innerHeight: number;
        devicePixelRatio: number;
    }
}

window.innerWidth = 0;
window.innerHeight = 0;
// TODO: Retina Display?
window.devicePixelRatio = 1;

// FIXME: linkedom bug? cannot set innerHTML with number
Object.defineProperties(HTMLElement.prototype, {
    // do nothing
    innerHTML: { set() { } },
    innerText: { set() { } },
});

// linkedom do not support these methods
HTMLElement.prototype.setPointerCapture = function setPointerCapture() {
    // console.info(`canvas.setPointerCapture()`);
};

HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {
    // console.info(`canvas.releasePointerCapture()`);
};

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    get: () => window.innerHeight,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    get: () => window.innerWidth,
});

// implement Image.src
const image_src_desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: image_src_desc.configurable,
    enumerable: image_src_desc.enumerable,
    get() { return image_src_desc.get!.call(this); },
    set(uri: string) {
        console.log(`Image loading ${uri}`);
        image_src_desc.set!.call(this, uri);
        (async () => {
            const data = await (await fetch(uri)).arrayBuffer();
            const imageData = await loadImageData(data);
            this.width = imageData.width;
            this.height = imageData.height;
            this._imageData = imageData;
            const event = new linkedom.Event('load');
            this.dispatchEvent(event);
        })();
    },
});

globalThis.HTMLCanvasElement = CanvasDomMock;
