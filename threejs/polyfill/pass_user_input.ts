import { EventType, getKeyName } from "deno_sdl2";
import { onScreenCanvas } from "./mock_canvas.ts";
import { Event } from "linkedom";

class MouseEvent extends Event {
    altKey: boolean = false;
    button: number = 0;
    buttons: number = 0;
    clientX: number = 0;
    clientY: number = 0;
    ctrlKey: boolean = false;
    // layerX: number = 0;
    // layerY: number = 0;
    metaKey: boolean = false;
    movementX: number = 0;
    movementY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    pageX: number = 0;
    pageY: number = 0;
    relatedTarget: EventTarget | null = null;
    screenX: number = 0;
    screenY: number = 0;
    shiftKey: boolean = false;
    x: number = 0;
    y: number = 0;

    // TODO: options
    constructor(name: string, _options?: undefined) {
        super(name, { bubbles: true })
    }
}

class PointerEvent extends MouseEvent {
    pointerType = "mouse";

    constructor(name: string, _options?: undefined) {
        super(name, _options);
    }
}

class WheelEvent extends MouseEvent {
    deltaMode: number;
    deltaX: number = 0;
    deltaY: number = 0;
    deltaZ: number = 0;
    DOM_DELTA_PIXEL = 0x00;
    DOM_DELTA_LINE = 0x01;
    DOM_DELTA_PAGE = 0x02;

    // TODO: options
    constructor(name: string, _options?: undefined) {
        super(name, _options);
        this.deltaMode = this.DOM_DELTA_PIXEL;
    }
}

let lastMousePos: undefined | { x: number, y: number };
let button0 = 0;

function setMouseEventXY(evt: MouseEvent, x: number, y: number, isMove = false) {
    evt.pageX = evt.offsetX = evt.screenX = evt.clientX = evt.x = x;
    evt.pageY = evt.offsetY = evt.screenY = evt.clientY = evt.y = y;

    evt.movementX = lastMousePos ? evt.screenX - lastMousePos.x : 0;
    evt.movementY = lastMousePos ? evt.screenY - lastMousePos.y : 0;

    if (isMove) {
        if (!lastMousePos) {
            lastMousePos = { x: evt.screenX, y: evt.screenY };
        }
        lastMousePos.x = evt.screenX;
        lastMousePos.y = evt.screenY;
    }
}


// disapth both mouse/pointer events
function dispatchPointerEvent(typ: string, x: number, y: number, buttons: number) {
    if (!onScreenCanvas) {
        return;
    }

    const evtP = new PointerEvent("pointer" + typ);
    setMouseEventXY(evtP, x, y, typ === "move");
    evtP.buttons = buttons;
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#determining_button_states
    if (typ === "move") {
        evtP.button = -1;
    }
    onScreenCanvas.dispatchEvent(evtP);

    const evtM = new MouseEvent("mouse" + typ);
    setMouseEventXY(evtM, x, y);
    evtM.movementX = evtP.movementX;
    evtM.movementY = evtP.movementY;
    evtM.buttons = buttons;
    onScreenCanvas.dispatchEvent(evtM);
}


// TODO: Handle keyboard events
// deno-lint-ignore no-explicit-any
export function processUserInput(event: any): boolean {
    do {
        if (event.type === EventType.KeyDown) {
            const kname = getKeyName(event.keysym.sym);
            if (kname === "Escape") {
                Deno.exit(0);
            } else if (kname === "F1") {
                Deno.exit(1)
            }
            break;
        } else if (event.type == EventType.MouseButtonDown) {
            dispatchPointerEvent("down", event.x, event.y, 1);
            button0 = 1;
            break;
        } else if (event.type == EventType.MouseButtonUp) {
            dispatchPointerEvent("up", event.x, event.y, 0);
            button0 = 0;
            break;
        } else if (event.type == EventType.MouseMotion) {
            dispatchPointerEvent("move", event.x, event.y, button0);
            break;
        } else if (event.type == EventType.MouseWheel) {
            const evt = new WheelEvent("wheel");
            evt.deltaX = event.x * 120;
            evt.deltaY = event.y * 120;
            evt.deltaMode = evt.DOM_DELTA_PIXEL;
            setMouseEventXY(evt, lastMousePos?.x ?? 0, lastMousePos?.y ?? 0);
            onScreenCanvas?.dispatchEvent(evt);
            break;
        }
        return false;
    } while (0);
    return true;
}
