import { join, dirname } from "jsr:@std/path@1.0"
import * as fs from "jsr:@std/fs@1.0"

import './mock_dom.ts';

// you can also use `--location` argument, for example
// `--location https://threejs.org/examples/webgpu_backdrop.html`
if (!location) {
    // TODO: support to pass query params from command arguments
    window.location = {
        search: ''
    } as Location;

    // mock `fetch` API to use cache

    const is_relative = function (uri: string): boolean {
        return uri.startsWith("./") || uri.startsWith("../") || !uri.match(/^\w+:/);
    };

    const is_cachable_url = function (uri: string): boolean {
        return uri.startsWith(THREEJS_RES_BASE_URL) || uri.startsWith(MATERIALX_RES_BASE_URL) || is_relative(uri);
    }

    const fetch_origin = fetch;
    globalThis.fetch = async function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
        const input_str = input instanceof Request ? input.url : input.toString();
        if (is_cachable_url(input_str)) {
            let data = await load_with_cache(input_str);
            data = hookModifyFetchResult(input_str, data);
            // https://docs.deno.com/runtime/reference/web_platform_apis/#fetching-local-files
            // > No headers are set on the response. Therefore it is up to the consumer to determine things like the content type or content length.
            const ctype = input_str.endsWith(".jpg") ? "image/jpeg" : input_str.endsWith(".png") ? "image/png" : input_str.endsWith(".gif") ? "image/gif" : undefined;
            // console.info(`fetch("${input_str}"): content-type: ${ctype}`);
            const headers = ctype ? { "content-type": ctype } : undefined;
            return new Response(data, { status: 200, headers });
        }
        if (input_str.startsWith("http:") || input_str.startsWith("https:"))
            console.info(`fetch(${input_str}) without cache`);
        return fetch_origin(input, init);
    };

    class RequestMock extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
            if (typeof input === "string" && is_relative(input)) {
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
        if (uri.startsWith("blob:") || uri.startsWith("data:")) {
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
                localPath = join(import.meta.dirname || '', '../cache', subpath);
            } else if (uri.startsWith(MATERIALX_RES_BASE_URL)) {
                subpath = uri.slice(MATERIALX_RES_BASE_URL.length);
                remotePath = new URL(subpath, MATERIALX_RES_BASE_URL_POLYFILL).toString();
                localPath = join(import.meta.dirname || '', '../cache/materialx', subpath);
            } else {
                remotePath = new URL(uri, THREEJS_RES_BASE_URL_POLYFILL).toString();
                localPath = join(import.meta.dirname || '', '../cache', uri);
            }
            return load_with_cache_abs(remotePath, localPath);
        } else {
            // direct fetch
            console.info(`fetch ${uri} without cache`);
            return (await fetch_origin(uri)).arrayBuffer();
        }
    }

    const load_with_cache_abs = async function (remotePath: string, localPath: string): Promise<ArrayBuffer> {
        if (import.meta.dirname === undefined || Deno.env.get("THREEJS_NO_CACHE") === "1") {
            return (await fetch_origin(remotePath)).arrayBuffer();
        }

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


// Deno 1.x has `window`, no `process`, be treated as web broswer environment.
// Deno 2.x has no `window`, but has `process`, be treated as Node.js environment.
//   but Deno 2.x does not have `require` ...
//
// to modify draco for:
//   - webgpu_postprocessing_ao.js
//   - webgpu_tsl_angular_slicing.js
//   - webgpu_loader_gltf_transmission.js
// to modify basis for:
//   - webgpu_loader_gltf_transmission.js
//   - webgpu_sandbox.js
function hookModifyFetchResult(url: string, data: ArrayBuffer): ArrayBuffer {
    if (url.endsWith('/draco_wasm_wrapper.js') || url.endsWith('/draco_decoder.js') || url.endsWith('/basis_transcoder.js')) {
        const content = new TextDecoder().decode(data);
        const newContent = 'delete globalThis.process;' + content;
        return new TextEncoder().encode(newContent).buffer as ArrayBuffer;
    }
    return data;
}
