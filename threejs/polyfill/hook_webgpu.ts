import { CanvasDomMock as HTMLCanvasElement } from "./mock_canvas.ts";

export let currentDevice: GPUDevice | undefined;

const GPUAdapter_requestDevice_origin = GPUAdapter.prototype.requestDevice;
GPUAdapter.prototype.requestDevice = async function requestDevice(descriptor?: GPUDeviceDescriptor) {
    const device = await GPUAdapter_requestDevice_origin.call(this, descriptor);
    currentDevice = device;
    return device;
};

// TypeScript definitions for WebGPU: https://github.com/gpuweb/types/blob/main/dist/index.d.ts

type GPUImageCopyExternalImageSource =
    | ImageBitmap
    | ImageData
    | HTMLImageElement
    // | HTMLVideoElement
    // | VideoFrame
    | HTMLCanvasElement
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

interface GPUQueueExt {
    copyExternalImageToTexture(
        sourceOptions: GPUImageCopyExternalImage,
        destination: GPUImageCopyTextureTagged,
        _copySize: GPUExtent3D): void;
}

// FIXME: deno do not support copyExternalImageToTexture
// https://github.com/denoland/deno/issues/23576
(GPUQueue.prototype as GPUQueueExt & GPUQueue).copyExternalImageToTexture = function copyExternalImageToTexture(
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
    } else if (source instanceof HTMLImageElement) {
        // RGBA8
        if (source._imageData) {
            imgData = source._imageData.data;
        } else {
            throw new Error('copyExternalImageToTexture: source._imageData is ' + source._imageData)
        }
        ({ height, width } = source);
    } else if (source instanceof HTMLCanvasElement) {
        if (!source._canvas2d) {
            throw new Error("only 2d canvas is supported to copyExternalImageToTexture");
        }
        imgData = new Uint8Array(source._canvas2d.data().buffer);
        width = source._canvas2d.width;
        height = source._canvas2d.height;
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
    (GPUDevice.prototype as { lost: Promise<GPUDeviceLostInfo> }).lost = new Promise(() => { });
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
    // @ts-ignore: inner data
    return bitmap[s_data]
}

// Error: This operation is currently not supported
// for webgpu_occlusion
GPUQuerySet.prototype.destroy = () => { };

const reIlligalCast = /[ui]32\(\s*([\d.]+)u?\s*\)/g;
// FIXME
const patEnableSubgroup = 'enable subgroups;';

const reLod = /(textureLoad\(.*)level\s*\);/g;

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
    // https://github.com/gfx-rs/wgpu/issues/5433
    if (descriptor.code.search(reLod) != -1) {
        descriptor.code = descriptor.code.replaceAll(reLod, '$1i32(level));');
    }
    return GPUDevice_createShaderModule_origin.call(this, descriptor);
};
