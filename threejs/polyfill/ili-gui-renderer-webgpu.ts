// ili-gui WebGPU renderer: draws GUI using @napi-rs/canvas for text, then composites onto WebGPU surface

import { createCanvas, type Canvas as Canvas2d, type SKRSContext2D } from 'npm:@napi-rs/canvas';
import type { GUIRenderer, TextMetrics, ClipRect } from './ili-gui.ts';
import { currentDevice } from './hook_webgpu.ts';
import { currentContextMock } from './mock_canvas.ts';
import type { Buffer } from "node:buffer";

const overlayShader = /* wgsl */ `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
};

@vertex
fn vert_main(@builtin(vertex_index) vindex: u32) -> VertexOutput {
    let verts = array(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
    var out: VertexOutput;
    out.position = vec4f(verts[vindex], 0, 1);
    out.tex_coord = vec2f(verts[vindex].x * 0.5 + 0.5, -verts[vindex].y * 0.5 + 0.5);
    return out;
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn frag_main(input: VertexOutput) -> @location(0) vec4f {
    return textureSample(tex, samp, input.tex_coord);
}
`;

/**
 * GUIRenderer implementation that draws to a @napi-rs/canvas 2D canvas,
 * then uploads and composites the result onto the WebGPU surface with alpha blending.
 *
 * Usage:
 *   const renderer = new WebGPURenderer(width, height);
 *   // each frame:
 *   renderer.beginFrame();
 *   gui.update(input, x, y, maxHeight);
 *   renderer.flush();
 */
export class WebGPURenderer implements GUIRenderer {
    private _canvas: Canvas2d;
    private _ctx: SKRSContext2D;
    private _width: number;
    private _height: number;

    // GPU resources (created lazily)
    private _gpuTexture: GPUTexture | undefined;
    private _pipeline: GPURenderPipeline | undefined;
    private _sampler: GPUSampler | undefined;
    private _bindGroup: GPUBindGroup | undefined;

    constructor(width = 300, height = 600) {
        this._width = width;
        this._height = height;
        this._canvas = createCanvas(width, height);
        this._ctx = this._canvas.getContext('2d');
    }

    resize(width: number, height: number) {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));
        if (width === this._width && height === this._height) return;
        this._width = width;
        this._height = height;
        this._canvas = createCanvas(width, height);
        this._ctx = this._canvas.getContext('2d');
        this._gpuTexture?.destroy();
        this._gpuTexture = undefined;
        this._bindGroup = undefined;
    }

    /** Clear the 2D canvas before a frame of GUI drawing. */
    beginFrame() {
        this._ctx.clearRect(0, 0, this._width, this._height);
    }

    /** Upload the 2D canvas and composite it onto the current WebGPU surface texture. */
    flush() {
        if (!currentDevice || !currentContextMock) return;
        const device = currentDevice;
        const dst = currentContextMock.getCurrentTexture();

        if (!this._gpuTexture) {
            this._gpuTexture = device.createTexture({
                format: 'rgba8unorm',
                size: [this._width, this._height],
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
                label: 'ili-gui-overlay',
            });
        }

        device.queue.writeTexture(
            { texture: this._gpuTexture },
            this._canvas.data() as Buffer<ArrayBuffer>,
            { bytesPerRow: this._width * 4 },
            [this._width, this._height],
        );

        if (!this._pipeline) {
            const module = device.createShaderModule({ code: overlayShader });
            this._pipeline = device.createRenderPipeline({
                layout: 'auto',
                primitive: { topology: 'triangle-strip' },
                vertex: { module },
                fragment: {
                    module,
                    targets: [{
                        format: dst.format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                        },
                    }],
                },
            });
        }

        if (!this._sampler) {
            this._sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        }

        if (!this._bindGroup) {
            this._bindGroup = device.createBindGroup({
                layout: this._pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this._gpuTexture.createView() },
                    { binding: 1, resource: this._sampler },
                ],
            });
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: dst.createView(),
                loadOp: 'load',
                storeOp: 'store',
            }],
        });
        pass.setPipeline(this._pipeline);
        pass.setViewport(0, 0, Math.min(this._width, dst.width), Math.min(this._height, dst.height), 0, 1);
        pass.setBindGroup(0, this._bindGroup);
        pass.draw(4);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    // ---- GUIRenderer interface ----

    fillRect(x: number, y: number, w: number, h: number, color: string): void {
        this._ctx.fillStyle = color;
        this._ctx.fillRect(x, y, w, h);
    }

    strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth?: number): void {
        const lw = lineWidth ?? 1;
        this._ctx.strokeStyle = color;
        this._ctx.lineWidth = lw;
        this._ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
    }

    fillText(text: string, x: number, y: number, color: string, fontSize: number, align?: string): void {
        this._ctx.fillStyle = color;
        this._ctx.font = `${fontSize}px sans-serif`;
        // deno-lint-ignore no-explicit-any
        this._ctx.textAlign = (align ?? 'left') as any;
        this._ctx.textBaseline = 'alphabetic';
        this._ctx.fillText(text, x, y);
    }

    measureText(text: string, fontSize: number): TextMetrics {
        this._ctx.font = `${fontSize}px sans-serif`;
        const m = this._ctx.measureText(text);
        return { width: m.width, height: fontSize };
    }

    pushClip(rect: ClipRect): void {
        this._ctx.save();
        this._ctx.beginPath();
        this._ctx.rect(rect.x, rect.y, rect.width, rect.height);
        this._ctx.clip();
    }

    popClip(): void {
        this._ctx.restore();
    }
}
