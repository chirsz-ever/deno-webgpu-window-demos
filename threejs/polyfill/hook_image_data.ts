import { fileTypeFromBuffer } from "npm:file-type@21.0.0";

// https://github.com/denoland/deno/pull/25517
const builtinImageFormatMimes = ['image/png', 'image/jpeg', 'image/bmp', 'image/vnd.microsoft.icon'];

// https://github.com/denoland/deno/issues/28723
const createImageBitmap_origin = globalThis.createImageBitmap;
// deno-lint-ignore no-explicit-any
globalThis.createImageBitmap = async function createImageBitmap(image: ImageBitmapSource, ...args: any[]) {
    if (image instanceof Blob) {
        if (builtinImageFormatMimes.includes(image.type))
            return createImageBitmap_origin(image, ...args);

        const buffer = await image.arrayBuffer();
        const ftype = await fileTypeFromBuffer(buffer);
        if (ftype && builtinImageFormatMimes.includes(ftype.mime)) {
            return createImageBitmap_origin(image, ...args);
        }

        // load RGBA data by hand
        const imgData = await loadImageData(buffer);
        return createImageBitmap_origin(imgData, ...args);
    }

    return createImageBitmap_origin(image, ...args);
};

function createRgbaImageData(data: Uint8Array, width: number, height: number): ImageData {
    let data_: Uint8ClampedArray;
    switch (data.length / (width * height)) {
        case 4:
            data_ = new Uint8ClampedArray(data);
            break;
        case 3:
            // RGB
            data_ = new Uint8ClampedArray(width * height * 4);
            for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
                data_[j] = data[i];
                data_[j + 1] = data[i + 1];
                data_[j + 2] = data[i + 2];
                data_[j + 3] = 255;
            }
            break;
        case 1:
            // Gray
            data_ = new Uint8ClampedArray(width * height * 4);
            for (let i = 0, j = 0; i < data.length; i++, j += 4) {
                data_[j] = data[i];
                data_[j + 1] = data[i];
                data_[j + 2] = data[i];
                data_[j + 3] = 255;
            }
            break;
        default:
            throw new Error(`failed to make RGBA data with length: ${data.length} width: ${width} height: ${height}`);
    }
    return new ImageData(data_, width, height);
}

export async function loadImageData(data: ArrayBuffer): Promise<ImageData> {
    const ftype = await fileTypeFromBuffer(data);
    if (!ftype) {
        throw new Error("cannot load image data: unkown image type");
    }
    if (['png', 'jpg'].includes(ftype.ext)) {
        const { getPixels } = await import("https://deno.land/x/get_pixels@v1.2.2/mod.ts");
        const { data: image_data, width, height } = await getPixels(data);
        const imgData = createRgbaImageData(image_data, width, height);
        return imgData;
    } else if (ftype.ext === 'gif') {
        const { parseGIF, decompressFrames } = await import("npm:gifuct-js@2.1.2");
        const gif = parseGIF(data);
        const frames = decompressFrames(gif, true);
        const frame0 = frames[0];
        const imgData = new ImageData(frame0.patch, frame0.dims.width, frame0.dims.height);
        return imgData;
    } else if (ftype.ext === 'webp') {
        const WebP = await import('npm:webp-wasm');
        const img = await WebP.decode(data);
        const imgData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
        return imgData;
    }
    throw new Error("cannot load image data: unkown supported type " + ftype.mime);
}

