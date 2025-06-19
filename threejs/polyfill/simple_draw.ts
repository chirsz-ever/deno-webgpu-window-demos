const simpleShader = /* wgsl */`

struct OurStruct {
    pos: vec2f,
    scale: vec2f,
};

@group(0) @binding(2) var<uniform> ubo: OurStruct;

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
    out.position = vec4f(pos * ubo.scale + ubo.pos, 0.0, 1.0);
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

let _simpleRenderPipeline: GPURenderPipeline | undefined;
function simpleRenderPipeline(device: GPUDevice): GPURenderPipeline {
    if (_simpleRenderPipeline)
        return _simpleRenderPipeline;

    const simpleMoudle = device.createShaderModule({ code: simpleShader });
    _simpleRenderPipeline = device.createRenderPipeline({
        layout: "auto",
        primitive: {
            topology: 'triangle-strip',
        },
        vertex: {
            module: simpleMoudle,
        },
        fragment: {
            module: simpleMoudle,
            targets: [{
                format: navigator.gpu.getPreferredCanvasFormat(),
            }],
        },
    });
    return _simpleRenderPipeline;
}

type Area = [number, number, number, number];
let _buffer: GPUBuffer | undefined;
const array = new Float32Array(4);
export function simpleRenderTexture(device: GPUDevice, src: GPUTexture, dst: GPUTexture, area: Area) {
    if (!_buffer) {
        _buffer = device.createBuffer({ size: 2 * 2 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM });
    }

    const sx = area[2] / dst.width;
    const sy = area[3] / dst.height;
    const x = -1 + area[0] / dst.width + sx;
    const y = 1 - area[1] / dst.height - sy;
    array.set([x, y, sx, sy]);
    device.queue.writeBuffer(_buffer, 0, array);
    const cmdEncoder = device.createCommandEncoder();
    const renderPass = cmdEncoder.beginRenderPass({
        colorAttachments: [{
            loadOp: 'load',
            storeOp: 'store',
            clearValue: [1, 0, 0, 1],
            view: dst.createView(),
        }]
    });
    renderPass.setPipeline(simpleRenderPipeline(device));
    renderPass.setBindGroup(0, simpleBindGroup(device, src.createView(), _buffer));
    renderPass.draw(4);
    renderPass.end();
    device.queue.submit([cmdEncoder.finish()]);
}

let _bindGroup: GPUBindGroup | undefined;

function simpleBindGroup(device: GPUDevice, view: GPUTextureView, buffer: GPUBuffer): GPUBindGroup {
    if (!_bindGroup) {
        _bindGroup = device.createBindGroup({
            entries: [
                {
                    binding: 0,
                    resource: view,
                },
                {
                    binding: 1,
                    resource: device.createSampler({
                        magFilter: 'linear',
                        minFilter: 'linear',
                    }),
                },
                {
                    binding: 2,
                    resource: { buffer },
                }
            ],
            layout: simpleRenderPipeline(device).getBindGroupLayout(0),
        });
    }
    return _bindGroup;
}
