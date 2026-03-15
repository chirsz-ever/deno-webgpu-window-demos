import { WebGPURenderer } from "./ili-gui-renderer-webgpu.ts";
import { GUI as IliGUI, type GUIOptions, type InputState } from "./ili-gui.ts";

export class GUI extends IliGUI {
    /** All root GUI instances (non-folder GUIs). */
    static _instances: GUI[] = [];

    /** Shared input state, updated by processUserInput each frame. */
    static _inputState: InputState = {
        mouseX: 0,
        mouseY: 0,
        mouseDown: false,
        mousePressed: false,
        mouseReleased: false,
        wheelDelta: 0,
        keysPressed: [],
        textInput: '',
    };

    /** Shared renderer for all root GUI instances. */
    static _renderer: WebGPURenderer | undefined;

    /** Bounding rects of all GUI panels, populated by _drawAll(). */
    static _guiAreas: { x: number; y: number; w: number; h: number }[] = [];

    /** True while the GUI has captured the mouse (press started on GUI). */
    static _mouseCaptured = false;

    domElement = { style: {} };

    constructor(options: GUIOptions = {}) {
        if (!options.parent) {
            if (!GUI._renderer) {
                GUI._renderer = new WebGPURenderer(
                    window.innerWidth ?? 1000,
                    window.innerHeight ?? 750,
                );
            }
            options.renderer = GUI._renderer;
        }
        super(options);
        if (!this.parent) {
            GUI._instances.push(this);
        }
    }

    override destroy(): void {
        super.destroy();
        const idx = GUI._instances.indexOf(this);
        if (idx !== -1) GUI._instances.splice(idx, 1);
    }

    /** Check if a point is over any GUI panel or the GUI has captured the mouse. */
    static _isMouseOverGUI(x: number, y: number): boolean {
        if (GUI._mouseCaptured) return true;
        for (const area of GUI._guiAreas) {
            if (x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h) {
                return true;
            }
        }
        return false;
    }

    /** Call once per frame before event processing. Resets nothing — input accumulates from SDL events. */
    static _beginFrame() {
        // Per-frame input is reset in _endFrame after GUI has consumed it.
    }

    /** Call once per frame after scene rendering to draw all GUI overlays. */
    static _drawAll() {
        if (GUI._instances.length === 0 || !GUI._renderer) return;
        const renderer = GUI._renderer;
        renderer.resize(window.innerWidth, window.innerHeight);
        renderer.beginFrame();

        GUI._guiAreas.length = 0;
        let x = window.innerWidth - 250;
        for (const gui of GUI._instances) {
            gui.update(GUI._inputState, x, 0, window.innerHeight);
            GUI._guiAreas.push({ x, y: 0, w: gui._width, h: gui._visibleHeight });
            x -= gui._width + 4;
        }

        renderer.flush();
    }

    /** Call once per frame after _drawAll to reset per-frame input state. */
    static _endFrame() {
        const s = GUI._inputState;
        s.mousePressed = false;
        s.mouseReleased = false;
        s.wheelDelta = 0;
        s.keysPressed = [];
        s.textInput = '';

        // Release capture on mouse up
        if (!s.mouseDown) {
            GUI._mouseCaptured = false;
        }
    }
}

export default GUI;
