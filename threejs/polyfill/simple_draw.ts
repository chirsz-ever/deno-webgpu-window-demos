const simpleShader = /* wgsl */`

struct OurVertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
};

@vertex
fn vert_main(@builtin(vertex_index) vindex: u32) -> OurVertexOutput {
    let vertexes = array(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0,  1.0),
    );
    var pos = vertexes[vindex];
    var out: OurVertexOutput;
    out.position = vec4f(pos, 0.0, 1.0);
    out.tex_coord = vec2f(pos.x * 0.5 + 0.5, -pos.y * 0.5 + 0.5);
    return out;
}

@group(0) @binding(0) var texture: texture_2d<f32>;
@group(0) @binding(1) var smplr: sampler;

@fragment
fn frag_main(input: OurVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(texture, smplr, input.tex_coord);
}
`;

type Area = [number, number, number, number] | { x: number, y: number, width: number, height: number };

/**
 * draw a simple rectangle with texture
 */
export class SimpleDrawer {
    constructor(device: GPUDevice, src: GPUTexture, dstFormat: GPUTextureFormat) {
        const _class = SimpleDrawer;
        this._device = device;

        let pipeline = _class.pipelineCache.get(dstFormat);
        if (!pipeline) {
            if (!_class.simpleMoudle) {
                _class.simpleMoudle = device.createShaderModule({ code: simpleShader });
            }
            pipeline = device.createRenderPipeline({
                layout: "auto",
                primitive: {
                    topology: 'triangle-strip',
                },
                vertex: {
                    module: _class.simpleMoudle,
                },
                fragment: {
                    module: _class.simpleMoudle,
                    targets: [{
                        format: dstFormat,
                    }],
                },
            });
            _class.pipelineCache.set(dstFormat, pipeline);
        }
        this._pipeline = pipeline;


        if (!_class.simpleSampler) {
            _class.simpleSampler = device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
            });
        }

        this._bindGroup = device.createBindGroup({
            entries: [
                {
                    binding: 0,
                    resource: src.createView(),
                },
                {
                    binding: 1,
                    resource: _class.simpleSampler,
                },
            ],
            layout: this._pipeline.getBindGroupLayout(0),
        });
    }

    private _device: GPUDevice;
    private _bindGroup: GPUBindGroup;
    private _pipeline: GPURenderPipeline;

    private static pipelineCache: Map<GPUTextureFormat, GPURenderPipeline> = new Map();
    private static simpleMoudle: GPUShaderModule | undefined;
    private static simpleSampler: GPUSampler | undefined;

    render(dst: GPUTexture, area: Area) {
        const [ax, ay, aw, ah] = Array.isArray(area) ? area : [area.x, area.y, area.width, area.height];
        const cmdEncoder = this._device.createCommandEncoder();
        const renderPass = cmdEncoder.beginRenderPass({
            colorAttachments: [{
                loadOp: 'load',
                storeOp: 'store',
                clearValue: [1, 0, 0, 1],
                view: dst.createView(),
            }]
        });
        renderPass.setPipeline(this._pipeline);
        renderPass.setViewport(ax, ay, aw, ah, 0, 1);
        renderPass.setBindGroup(0, this._bindGroup);
        renderPass.draw(4);
        renderPass.end();
        this._device.queue.submit([cmdEncoder.finish()]);
    }
}
