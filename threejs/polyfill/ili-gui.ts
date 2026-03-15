// ili-gui: A DOM-free lil-gui compatible library
// Renders GUI via user-provided drawing primitives (rectangles, text, clipping)

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Text measurement result */
export interface TextMetrics {
  width: number;
  height: number;
}

/** Clipping rectangle */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Drawing backend that users must implement.
 * Attached to the root GUI via the `renderer` option.
 */
export interface GUIRenderer {
  /** Draw a filled rectangle */
  fillRect(x: number, y: number, w: number, h: number, color: string): void;
  /** Draw a rectangle outline */
  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth?: number): void;
  /** Draw text. Returns nothing. `align` is 'left' | 'center' | 'right'. */
  fillText(text: string, x: number, y: number, color: string, fontSize: number, align?: string): void;
  /** Measure a text string at a given font size */
  measureText(text: string, fontSize: number): TextMetrics;
  /** Push a clip rectangle. Drawing is restricted to this region until popClip. */
  pushClip(rect: ClipRect): void;
  /** Pop the last clip rectangle. */
  popClip(): void;
}

/** Input state provided each frame via gui.update(input) */
export interface InputState {
  /** Current mouse X in GUI coordinate space */
  mouseX: number;
  /** Current mouse Y in GUI coordinate space */
  mouseY: number;
  /** Is the primary mouse button currently pressed? */
  mouseDown: boolean;
  /** Was the primary mouse button just pressed this frame? */
  mousePressed: boolean;
  /** Was the primary mouse button just released this frame? */
  mouseReleased: boolean;
  /** Mouse wheel delta (positive = scroll down) */
  wheelDelta?: number;
  /** Keys just pressed this frame (e.g. 'Enter', 'Escape', 'Backspace', 'ArrowLeft', ...) */
  keysPressed?: string[];
  /** Text input characters this frame (for text field editing) */
  textInput?: string;
}

export interface GUIOptions {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  title?: string;
  closeFolders?: boolean;
  parent?: GUI;
  renderer?: GUIRenderer;
}

interface ChangeEvent {
  object: any;
  property: string;
  value: any;
  controller: Controller;
}

// ============================================================================
// Theme / Style constants
// ============================================================================

const Theme = {
  backgroundColor: '#1a1a1a',
  folderBackgroundColor: '#222222',
  titleBarColor: '#2a2a2a',
  titleBarHoverColor: '#3a3a3a',
  widgetColor: '#3c3c3c',
  widgetHoverColor: '#4c4c4c',
  widgetFocusColor: '#5c5c5c',
  numberColor: '#2cc8ff',
  stringColor: '#1ed760',
  sliderFilledColor: '#0090ff',
  textColor: '#ebebeb',
  textMutedColor: '#b0b0b0',
  disabledTextColor: '#666666',
  borderColor: '#444444',
  checkboxCheckedColor: '#0090ff',
  buttonHoverColor: '#3c3c3c',
  colorSwatchBorderColor: '#ffffff33',
  fontSize: 11,
  titleFontSize: 12,
  rowHeight: 26,
  titleBarHeight: 28,
  padding: 6,
  nameWidth: 0.4, // fraction of total width
  scrollbarWidth: 8,
  scrollbarColor: '#555555',
  scrollbarHoverColor: '#777777',
  indentWidth: 10,
};

// ============================================================================
// Drawing helpers (no Unicode text – use rects to draw shapes)
// ============================================================================

/** Draw a small triangle arrow (right-pointing if collapsed, down-pointing if open) */
function _drawArrow(renderer: GUIRenderer, x: number, cy: number, collapsed: boolean, color: string) {
  const s = 4; // half-size
  if (collapsed) {
    // Right-pointing triangle: 3 horizontal lines
    for (let i = 0; i <= s; i++) {
      renderer.fillRect(x + i, cy - s + i, 1, (s - i) * 2 + 1, color);
    }
  } else {
    // Down-pointing triangle: 3 horizontal lines
    for (let i = 0; i <= s; i++) {
      renderer.fillRect(x - s + i, cy + i, (s - i) * 2 + 1, 1, color);
    }
  }
}

/** Draw a checkmark inside a checkbox */
function _drawCheckmark(renderer: GUIRenderer, bx: number, by: number, boxSize: number, color: string) {
  // Simple checkmark as two diagonal strokes
  const cx = bx + boxSize * 0.25;
  const cy = by + boxSize * 0.55;
  // Descending stroke (left part of check)
  for (let i = 0; i < 3; i++) {
    renderer.fillRect(cx + i, cy - 2 + i, 2, 2, color);
  }
  // Ascending stroke (right part of check)
  for (let i = 0; i < 6; i++) {
    renderer.fillRect(cx + 2 + i, cy + 0 - i, 2, 2, color);
  }
}

/** Draw up/down arrows for dropdown indicator */
function _drawUpDownArrows(renderer: GUIRenderer, cx: number, cy: number, color: string) {
  // Up arrow
  for (let i = 0; i < 3; i++) {
    renderer.fillRect(cx - i, cy - 5 + i, i * 2 + 1, 1, color);
  }
  // Down arrow
  for (let i = 0; i < 3; i++) {
    renderer.fillRect(cx - i, cy + 5 - i, i * 2 + 1, 1, color);
  }
}

// ============================================================================
// Color utility
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) return null;
  const n = parseInt(hex, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function parseColor(value: any, rgbScale: number): string {
  if (typeof value === 'string') {
    // CSS color string
    const hex = cssColorToHex(value);
    return hex ?? '#000000';
  }
  if (typeof value === 'number') {
    return '#' + (value & 0xffffff).toString(16).padStart(6, '0');
  }
  if (Array.isArray(value)) {
    const scale = 255 / rgbScale;
    return rgbToHex(value[0] * scale, value[1] * scale, value[2] * scale);
  }
  if (typeof value === 'object' && value !== null && 'r' in value) {
    const scale = 255 / rgbScale;
    return rgbToHex(value.r * scale, value.g * scale, value.b * scale);
  }
  return '#000000';
}

function cssColorToHex(str: string): string | null {
  str = str.trim().toLowerCase();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (/^[0-9a-f]{6}$/.test(hex)) return '#' + hex;
    return null;
  }
  const rgbMatch = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  return null;
}

function writeColorBack(original: any, hexStr: string, rgbScale: number): any {
  const rgb = hexToRgb(hexStr);
  if (!rgb) return original;
  if (typeof original === 'string') {
    return hexStr;
  }
  if (typeof original === 'number') {
    return parseInt(hexStr.slice(1), 16);
  }
  const scale = rgbScale / 255;
  if (Array.isArray(original)) {
    original[0] = rgb.r * scale;
    original[1] = rgb.g * scale;
    original[2] = rgb.b * scale;
    return original;
  }
  if (typeof original === 'object' && original !== null) {
    original.r = rgb.r * scale;
    original.g = rgb.g * scale;
    original.b = rgb.b * scale;
    return original;
  }
  return original;
}

// ============================================================================
// Color Picker Utility
// ============================================================================

function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, v: 0 };
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return rgbToHex(r * 255, g * 255, b * 255);
}

// ============================================================================
// Controller
// ============================================================================

type ControllerType = 'boolean' | 'number' | 'string' | 'function' | 'option' | 'color';

export class Controller {
  /** The object this controller will modify */
  object: any;
  /** The name of the property to control */
  property: string;
  /** The GUI that contains this controller */
  parent: GUI;
  /** The value when the controller was created */
  initialValue: any;

  _name: string;
  _disabled: boolean = false;
  _hidden: boolean = false;
  _listening: boolean = false;
  _onChange: ((value: any) => void) | undefined;
  _onFinishChange: ((value: any) => void) | undefined;
  _type: ControllerType;

  // Number-specific
  _min: number | undefined;
  _max: number | undefined;
  _step: number | undefined;
  _decimals: number | undefined;
  _hasSlider: boolean = false;

  // Option-specific (dropdown)
  _options: any[] | Record<string, any> | undefined;
  _optionLabels: string[] = [];
  _optionValues: any[] = [];

  // Color-specific
  _rgbScale: number = 1;
  _colorPickerOpen: boolean = false;
  _colorHSV: { h: number; s: number; v: number } = { h: 0, s: 0, v: 0 };

  // UI state
  _editing: boolean = false;
  _editText: string = '';
  _editCursorPos: number = 0;
  _hovered: boolean = false;
  _sliderDragging: boolean = false;
  _dropdownOpen: boolean = false;
  _dropdownHoveredIndex: number = -1;

  constructor(parent: GUI, object: any, property: string, type: ControllerType, rgbScale?: number) {
    this.parent = parent;
    this.object = object;
    this.property = property;
    this._type = type;
    this._name = property;
    this.initialValue = this._cloneValue(object[property]);

    if (type === 'color') {
      this._rgbScale = rgbScale ?? 1;
      this._colorHSV = hexToHSV(parseColor(object[property], this._rgbScale));
    }
  }

  private _cloneValue(val: any): any {
    if (Array.isArray(val)) return [...val];
    if (typeof val === 'object' && val !== null) return { ...val };
    return val;
  }

  // --- Public API ---

  name(name: string): this {
    this._name = name;
    return this;
  }

  onChange(callback: (value: any) => void): this {
    this._onChange = callback;
    return this;
  }

  onFinishChange(callback: (value: any) => void): this {
    this._onFinishChange = callback;
    return this;
  }

  reset(): this {
    this.setValue(this._cloneValue(this.initialValue));
    return this;
  }

  enable(enabled: boolean = true): this {
    this._disabled = !enabled;
    return this;
  }

  disable(disabled: boolean = true): this {
    this._disabled = disabled;
    return this;
  }

  show(show: boolean = true): this {
    this._hidden = !show;
    return this;
  }

  hide(): this {
    this._hidden = true;
    return this;
  }

  options(options: any[] | Record<string, any>): Controller {
    // If already an option controller, just update
    if (this._type === 'option') {
      this._setOptions(options);
      return this;
    }
    // Convert to option controller
    this._type = 'option';
    this._setOptions(options);
    return this;
  }

  private _setOptions(opts: any[] | Record<string, any>) {
    this._options = opts;
    if (Array.isArray(opts)) {
      this._optionLabels = opts.map(String);
      this._optionValues = opts;
    } else {
      this._optionLabels = Object.keys(opts);
      this._optionValues = Object.values(opts);
    }
  }

  min(min: number): this {
    this._min = min;
    this._updateSliderState();
    return this;
  }

  max(max: number): this {
    this._max = max;
    this._updateSliderState();
    return this;
  }

  step(step: number): this {
    this._step = step;
    return this;
  }

  decimals(decimals: number): this {
    this._decimals = decimals;
    return this;
  }

  listen(listen: boolean = true): this {
    this._listening = listen;
    return this;
  }

  getValue(): any {
    return this.object[this.property];
  }

  setValue(value: any): this {
    if (this._type === 'number' && typeof value === 'number') {
      if (this._step !== undefined) {
        value = Math.round(value / this._step) * this._step;
      }
      if (this._min !== undefined) value = Math.max(this._min, value);
      if (this._max !== undefined) value = Math.min(this._max, value);
    }
    this.object[this.property] = value;
    this._callOnChange();
    this.updateDisplay();
    return this;
  }

  updateDisplay(): this {
    if (this._type === 'color') {
      this._colorHSV = hexToHSV(parseColor(this.object[this.property], this._rgbScale));
    }
    return this;
  }

  destroy(): void {
    const idx = this.parent.controllers.indexOf(this);
    if (idx !== -1) this.parent.controllers.splice(idx, 1);
    const childIdx = this.parent.children.indexOf(this);
    if (childIdx !== -1) this.parent.children.splice(childIdx, 1);
  }

  private _updateSliderState() {
    this._hasSlider = this._min !== undefined && this._max !== undefined;
  }

  _callOnChange() {
    if (this._onChange) {
      this._onChange.call(this, this.getValue());
    }
    // Bubble up
    this.parent._bubbleOnChange(this);
  }

  _callOnFinishChange() {
    if (this._onFinishChange) {
      this._onFinishChange.call(this, this.getValue());
    }
    this.parent._bubbleOnFinishChange(this);
  }

  // --- Display value ---

  _displayValue(): string {
    const val = this.getValue();
    if (this._type === 'option') {
      const idx = this._optionValues.indexOf(val);
      if (idx !== -1) return this._optionLabels[idx];
      return String(val);
    }
    if (this._type === 'number') {
      if (this._decimals !== undefined) return Number(val).toFixed(this._decimals);
      // Auto-detect reasonable decimals
      if (this._step !== undefined) {
        const dec = this._step.toString().split('.')[1];
        return Number(val).toFixed(dec ? dec.length : 0);
      }
      return String(val);
    }
    if (this._type === 'color') {
      return parseColor(val, this._rgbScale);
    }
    return String(val);
  }
}

// ============================================================================
// GUI
// ============================================================================

export class GUI {
  /** The list of controllers and folders contained by this GUI */
  children: (GUI | Controller)[] = [];
  /** The list of controllers contained by this GUI */
  controllers: Controller[] = [];
  /** The list of folders contained by this GUI */
  folders: GUI[] = [];
  /** The GUI containing this folder, or undefined if root */
  parent: GUI | undefined;
  /** The top level GUI */
  root: GUI;

  _closed: boolean = false;
  _hidden: boolean = false;
  _title: string;
  _onChange: ((event: ChangeEvent) => void) | undefined;
  _onFinishChange: ((event: ChangeEvent) => void) | undefined;
  _onOpenClose: ((gui: GUI) => void) | undefined;
  _width: number;
  _minWidth: number;
  _maxWidth: number;
  _closeFolders: boolean;

  // Renderer (only on root)
  _renderer: GUIRenderer | undefined;

  /** Overlay rects (color picker, dropdown) computed during update, for external hit-testing. */
  _overlayAreas: { x: number; y: number; w: number; h: number }[] = [];

  // Layout state (computed during draw)
  _x: number = 0;
  _y: number = 0;
  _scrollY: number = 0;
  _contentHeight: number = 0;
  _visibleHeight: number = 0;
  _maxVisibleHeight: number = 600; // default max height for root
  _scrollbarDragging: boolean = false;
  _scrollbarDragStartY: number = 0;
  _scrollbarDragStartScroll: number = 0;

  // Active element tracking (root only)
  _activeController: Controller | null = null;
  _focusedController: Controller | null = null;

  // Color picker state (root only, shared)
  _colorPickerActive: Controller | null = null;

  constructor(options: GUIOptions = {}) {
    this._width = options.width ?? 245;
    this._minWidth = options.minWidth ?? 180;
    this._maxWidth = options.maxWidth ?? 400;
    this._title = options.title ?? 'Controls';
    this._closeFolders = options.closeFolders ?? false;
    this.parent = options.parent;
    this.root = this.parent ? this.parent.root : this;

    if (!this.parent) {
      this._renderer = options.renderer;
    }

    if (this.parent && this._closeFolders) {
      this._closed = true;
    }
    if (this.parent && this.parent._closeFolders) {
      this._closed = true;
    }
  }

  // --- Public API ---

  add(object: any, property: string, $1?: any, max?: number, step?: number): Controller {
    const value = object[property];

    // If $1 is an array or object (not number), create option controller
    if ($1 !== undefined && typeof $1 !== 'number') {
      const ctrl = new Controller(this, object, property, 'option');
      ctrl.options($1);
      this._addController(ctrl);
      return ctrl;
    }

    // Infer type
    const type = typeof value;
    let controllerType: ControllerType;

    switch (type) {
      case 'boolean':
        controllerType = 'boolean';
        break;
      case 'string':
        controllerType = 'string';
        break;
      case 'function':
        controllerType = 'function';
        break;
      case 'number':
        controllerType = 'number';
        break;
      default:
        controllerType = 'string';
    }

    const ctrl = new Controller(this, object, property, controllerType);

    if (controllerType === 'number') {
      if ($1 !== undefined) ctrl.min($1);
      if (max !== undefined) ctrl.max(max);
      if (step !== undefined) ctrl.step(step);
    }

    this._addController(ctrl);
    return ctrl;
  }

  addColor(object: any, property: string, rgbScale: number = 1): Controller {
    const ctrl = new Controller(this, object, property, 'color', rgbScale);
    this._addController(ctrl);
    return ctrl;
  }

  addFolder(title: string): GUI {
    const folder = new GUI({
      title,
      parent: this,
      closeFolders: this._closeFolders,
    });
    this.folders.push(folder);
    this.children.push(folder);
    return folder;
  }

  load(obj: any, recursive: boolean = true): this {
    if (obj.controllers) {
      for (const ctrl of this.controllers) {
        if (ctrl._name in obj.controllers) {
          ctrl.setValue(obj.controllers[ctrl._name]);
        }
      }
    }
    if (recursive && obj.folders) {
      for (const folder of this.folders) {
        if (folder._title in obj.folders) {
          folder.load(obj.folders[folder._title], true);
        }
      }
    }
    return this;
  }

  save(recursive: boolean = true): any {
    const result: any = { controllers: {}, folders: {} };

    // Check for name collisions
    const names = new Set<string>();
    for (const ctrl of this.controllers) {
      if (names.has(ctrl._name)) {
        throw new Error(`Cannot save, duplicate controller name: "${ctrl._name}"`);
      }
      names.add(ctrl._name);
    }
    if (recursive) {
      const folderNames = new Set<string>();
      for (const folder of this.folders) {
        if (folderNames.has(folder._title)) {
          throw new Error(`Cannot save, duplicate folder name: "${folder._title}"`);
        }
        folderNames.add(folder._title);
      }
    }

    for (const ctrl of this.controllers) {
      result.controllers[ctrl._name] = ctrl.getValue();
    }

    if (recursive) {
      for (const folder of this.folders) {
        result.folders[folder._title] = folder.save(true);
      }
    }

    return result;
  }

  open(open: boolean = true): this {
    this._closed = !open;
    if (this._onOpenClose) this._onOpenClose(this);
    // Bubble up
    if (this.parent) {
      let p: GUI | undefined = this.parent;
      while (p) {
        if (p._onOpenClose) p._onOpenClose(this);
        p = p.parent;
      }
    }
    return this;
  }

  close(): this {
    return this.open(false);
  }

  show(show: boolean = true): this {
    this._hidden = !show;
    return this;
  }

  hide(): this {
    this._hidden = true;
    return this;
  }

  title(title: string): this {
    this._title = title;
    return this;
  }

  reset(recursive: boolean = true): this {
    for (const ctrl of this.controllers) {
      ctrl.reset();
    }
    if (recursive) {
      for (const folder of this.folders) {
        folder.reset(true);
      }
    }
    return this;
  }

  onChange(callback: (event: ChangeEvent) => void): this {
    this._onChange = callback;
    return this;
  }

  onFinishChange(callback: (event: ChangeEvent) => void): this {
    this._onFinishChange = callback;
    return this;
  }

  onOpenClose(callback: (gui: GUI) => void): this {
    this._onOpenClose = callback;
    return this;
  }

  destroy(): void {
    // Remove from parent
    if (this.parent) {
      const idx = this.parent.folders.indexOf(this);
      if (idx !== -1) this.parent.folders.splice(idx, 1);
      const childIdx = this.parent.children.indexOf(this);
      if (childIdx !== -1) this.parent.children.splice(childIdx, 1);
    }
    // Destroy all children
    for (const child of [...this.children]) {
      if (child instanceof Controller) {
        child.destroy();
      } else {
        child.destroy();
      }
    }
    this.controllers = [];
    this.folders = [];
    this.children = [];
  }

  controllersRecursive(): Controller[] {
    const result: Controller[] = [...this.controllers];
    for (const folder of this.folders) {
      result.push(...folder.controllersRecursive());
    }
    return result;
  }

  foldersRecursive(): GUI[] {
    const result: GUI[] = [...this.folders];
    for (const folder of this.folders) {
      result.push(...folder.foldersRecursive());
    }
    return result;
  }

  // --- Internal ---

  private _addController(ctrl: Controller) {
    this.controllers.push(ctrl);
    this.children.push(ctrl);
  }

  _bubbleOnChange(ctrl: Controller) {
    const event: ChangeEvent = {
      object: ctrl.object,
      property: ctrl.property,
      value: ctrl.getValue(),
      controller: ctrl,
    };
    if (this._onChange) this._onChange(event);
    if (this.parent) this.parent._bubbleOnChange(ctrl);
  }

  _bubbleOnFinishChange(ctrl: Controller) {
    const event: ChangeEvent = {
      object: ctrl.object,
      property: ctrl.property,
      value: ctrl.getValue(),
      controller: ctrl,
    };
    if (this._onFinishChange) this._onFinishChange(event);
    if (this.parent) this.parent._bubbleOnFinishChange(ctrl);
  }

  // =========================================================================
  // Rendering & Input
  // =========================================================================

  /** Set the renderer. Can be changed at any time. */
  setRenderer(renderer: GUIRenderer): this {
    if (this.root === this) {
      this._renderer = renderer;
    } else {
      this.root._renderer = renderer;
    }
    return this;
  }

  /** Get the renderer from root */
  private _getRenderer(): GUIRenderer {
    const r = this.root._renderer;
    if (!r) throw new Error('ili-gui: No renderer set. Call gui.setRenderer(renderer) before drawing.');
    return r;
  }

  /**
   * Update and draw the GUI. Call once per frame on the root GUI only.
   * @param input Current input state
   * @param x X position to draw the GUI at
   * @param y Y position to draw the GUI at
   * @param maxHeight Maximum visible height before scrolling applies (optional)
   */
  update(input: InputState, x?: number, y?: number, maxHeight?: number): void {
    if (this.parent) {
      throw new Error('ili-gui: update() should only be called on the root GUI');
    }
    if (this._hidden) return;

    this._x = x ?? 0;
    this._y = y ?? 0;
    if (maxHeight !== undefined) this._maxVisibleHeight = maxHeight;

    // Update listening controllers
    for (const ctrl of this.controllersRecursive()) {
      if (ctrl._listening) {
        ctrl.updateDisplay();
      }
    }

    const renderer = this._getRenderer();

    // Dynamic width: skip recalculation while any controller is being interacted with
    // to prevent layout jitter during slider dragging or text editing
    const interacting = this._activeController != null || this._focusedController != null
      || this._colorPickerActive != null
      || this.controllersRecursive().some(c => c._sliderDragging || c._editing || c._dropdownOpen);
    if (!interacting) {
      this._width = this._calcAutoWidth(renderer);
    }
    this._overlayAreas = [];

    // Calculate content height
    this._contentHeight = this._calcContentHeight();
    this._visibleHeight = Math.min(this._contentHeight, this._maxVisibleHeight);

    // Handle scrolling
    this._handleScroll(input);

    // Clip to GUI bounds
    renderer.pushClip({
      x: this._x,
      y: this._y,
      width: this._width,
      height: this._visibleHeight,
    });

    // Draw background
    renderer.fillRect(this._x, this._y, this._width, this._contentHeight, Theme.backgroundColor);

    // When an overlay (dropdown or color picker) is active, suppress hover/click
    // on controllers behind it so they don't react to mouse events.
    const hasActiveOverlay =
      (this._colorPickerActive != null && this._colorPickerActive._colorPickerOpen) ||
      this.controllersRecursive().some(c => c._dropdownOpen);
    const mainInput = hasActiveOverlay ? {
      ...input,
      mouseDown: false,
      mousePressed: false,
      mouseReleased: false,
      mouseX: -9999,
      mouseY: -9999,
    } : input;

    // Draw children
    let cursorY = this._y - this._scrollY;
    cursorY = this._drawGUI(this, mainInput, this._x, cursorY, this._width, renderer);

    renderer.popClip();

    // Draw scrollbar if needed
    if (this._contentHeight > this._visibleHeight) {
      this._drawScrollbar(renderer, input);
    }

    // Draw border around the whole GUI panel
    renderer.strokeRect(this._x, this._y, this._width, this._visibleHeight, Theme.borderColor, 1);

    // Draw color picker overlay if active
    if (this._colorPickerActive && this._colorPickerActive._colorPickerOpen) {
      this._drawColorPicker(this._colorPickerActive, input, renderer);
    }

    // Draw dropdown overlay if active
    for (const ctrl of this.controllersRecursive()) {
      if (ctrl._dropdownOpen) {
        this._drawDropdownOverlay(ctrl, input, renderer);
      }
    }

    // Handle focus loss
    if (input.mousePressed && this._focusedController) {
      // Check if click is outside the focused controller
      // This is simplified; focus is lost on next click elsewhere
    }
  }

  /** Calculate total content height recursively */
  private _calcContentHeight(): number {
    return this._calcGUIHeight(this);
  }

  /** Calculate auto width based on content text, clamped to [minWidth, maxWidth] */
  private _calcAutoWidth(renderer: GUIRenderer): number {
    let maxNameW = 0;

    // Measure title
    const titleW = renderer.measureText(this._title, Theme.titleFontSize).width + Theme.padding * 2 + 14;

    const measureGUI = (gui: GUI, depth: number) => {
      const indent = depth * Theme.indentWidth;
      const tW = renderer.measureText(gui._title, Theme.titleFontSize).width + Theme.padding * 2 + 14 + indent;
      if (tW > maxNameW) {
        maxNameW = tW;
      }
      if (gui._closed) return;
      for (const child of gui.children) {
        if (child instanceof Controller && !child._hidden) {
          const nw = renderer.measureText(child._name, Theme.fontSize).width + indent;
          if (nw > maxNameW) maxNameW = nw;
          // For option controllers, measure option labels (they are stable)
          if (child._type === 'option') {
            for (const label of child._optionLabels) {
              const lw = renderer.measureText(label, Theme.fontSize).width;
              if (lw > maxNameW) maxNameW = lw;
            }
          }
        } else if (child instanceof GUI && !child._hidden) {
          measureGUI(child, depth + 1);
        }
      }
    };
    measureGUI(this, 0);

    // Width = name area / nameWidth fraction. Add padding for widget area.
    const computed = Math.max(titleW, maxNameW / Theme.nameWidth + Theme.padding * 2);
    return Math.max(this._minWidth, Math.min(this._maxWidth, Math.round(computed)));
  }

  private _calcGUIHeight(gui: GUI): number {
    let h = Theme.titleBarHeight; // title bar
    if (!gui._closed) {
      for (const child of gui.children) {
        if (child instanceof Controller) {
          if (!child._hidden) h += Theme.rowHeight;
        } else {
          if (!child._hidden) h += this._calcGUIHeight(child);
        }
      }
    }
    return h;
  }

  /** Draw a GUI (folder or root) */
  private _drawGUI(gui: GUI, input: InputState, x: number, y: number, width: number, renderer: GUIRenderer): number {
    const titleBarY = y;
    const isFolder = gui.parent !== undefined;

    if (isFolder) {
      const titleBarColor = this._isHovered(input, x, titleBarY, width, Theme.titleBarHeight)
        ? Theme.titleBarHoverColor
        : Theme.backgroundColor;
      renderer.fillRect(x, titleBarY, width, Theme.titleBarHeight, titleBarColor);
      renderer.fillRect(x, titleBarY, width, 1, Theme.borderColor);
      renderer.fillRect(x, titleBarY + Theme.titleBarHeight - 1, width, 1, Theme.borderColor);

      const arrowX = x + Theme.padding;
      const arrowCY = titleBarY + Theme.titleBarHeight / 2;
      _drawArrow(renderer, arrowX, arrowCY, gui._closed, Theme.textColor);
      renderer.fillText(
        gui._title,
        arrowX + 12,
        titleBarY + Theme.titleBarHeight / 2 + Theme.titleFontSize * 0.35,
        Theme.textColor,
        Theme.titleFontSize,
        'left',
      );

      if (input.mousePressed && this._isHovered(input, x, titleBarY, width, Theme.titleBarHeight)) {
        gui.open(gui._closed);
      }
    } else {
      const titleBarColor = this._isHovered(input, x, titleBarY, width, Theme.titleBarHeight)
        ? Theme.titleBarHoverColor
        : Theme.titleBarColor;
      renderer.fillRect(x, titleBarY, width, Theme.titleBarHeight, titleBarColor);

      const arrowX = x + Theme.padding;
      const arrowCY = titleBarY + Theme.titleBarHeight / 2;
      _drawArrow(renderer, arrowX, arrowCY, gui._closed, Theme.textColor);
      renderer.fillText(
        gui._title,
        arrowX + 12,
        titleBarY + Theme.titleBarHeight / 2 + Theme.titleFontSize * 0.35,
        Theme.textColor,
        Theme.titleFontSize,
        'left',
      );

      if (input.mousePressed && this._isHovered(input, x, titleBarY, width, Theme.titleBarHeight)) {
        gui.open(gui._closed);
      }
    }

    let cursorY = titleBarY + Theme.titleBarHeight;

    if (gui._closed) return cursorY;

    // Folders indent their children; root does not
    const contentX = isFolder ? x + Theme.indentWidth : x;
    const contentW = isFolder ? width - Theme.indentWidth : width;
    const childStartY = cursorY;

    // Draw children
    for (const child of gui.children) {
      if (child instanceof Controller) {
        if (child._hidden) continue;
        cursorY = this._drawController(child, input, contentX, cursorY, contentW, renderer);
      } else {
        if (child._hidden) continue;
        cursorY = this._drawGUI(child, input, contentX, cursorY, contentW, renderer);
      }
    }

    // Draw vertical line on the left of indented folder content
    if (isFolder && cursorY > childStartY) {
      const lineX = x + Math.floor(Theme.indentWidth / 2);
      renderer.fillRect(lineX, childStartY, 1, cursorY - childStartY, Theme.borderColor);
    }

    return cursorY;
  }

  // --- Draw individual controllers ---

  private _drawController(
    ctrl: Controller,
    input: InputState,
    x: number,
    y: number,
    width: number,
    renderer: GUIRenderer,
  ): number {
    const rowH = Theme.rowHeight;
    const hovered = this._isHovered(input, x, y, width, rowH);
    ctrl._hovered = hovered;

    // Row background
    const bgColor = hovered && !ctrl._disabled ? Theme.widgetHoverColor : Theme.backgroundColor;
    renderer.fillRect(x, y, width, rowH, bgColor);

    // Separator line at bottom
    renderer.fillRect(x, y + rowH - 1, width, 1, Theme.folderBackgroundColor);

    const nameW = width * Theme.nameWidth;
    const widgetX = x + nameW;
    const widgetW = width - nameW - Theme.padding;

    // Name label
    const textColor = ctrl._disabled ? Theme.disabledTextColor : Theme.textColor;
    renderer.fillText(
      ctrl._name,
      x + Theme.padding,
      y + rowH / 2 + Theme.fontSize * 0.35,
      textColor,
      Theme.fontSize,
      'left',
    );

    // Widget area based on type
    switch (ctrl._type) {
      case 'boolean':
        this._drawBooleanWidget(ctrl, input, widgetX, y, widgetW, rowH, renderer);
        break;
      case 'number':
        this._drawNumberWidget(ctrl, input, widgetX, y, widgetW, rowH, renderer);
        break;
      case 'string':
        this._drawStringWidget(ctrl, input, widgetX, y, widgetW, rowH, renderer);
        break;
      case 'function':
        this._drawFunctionWidget(ctrl, input, x, y, width, rowH, renderer);
        break;
      case 'option':
        this._drawOptionWidget(ctrl, input, widgetX, y, widgetW, rowH, renderer);
        break;
      case 'color':
        this._drawColorWidget(ctrl, input, widgetX, y, widgetW, rowH, renderer);
        break;
    }

    return y + rowH;
  }

  // --- Boolean (checkbox) ---
  private _drawBooleanWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const boxSize = 14;
    const bx = x + Theme.padding;
    const by = y + (h - boxSize) / 2;
    const checked = !!ctrl.getValue();

    renderer.fillRect(bx, by, boxSize, boxSize, checked ? Theme.checkboxCheckedColor : Theme.widgetColor);
    renderer.strokeRect(bx, by, boxSize, boxSize, Theme.borderColor, 1);

    if (checked) {
      _drawCheckmark(renderer, bx, by, boxSize, '#ffffff');
    }

    if (!ctrl._disabled && input.mousePressed && this._isHovered(input, bx, by, boxSize, boxSize)) {
      ctrl.setValue(!checked);
      ctrl._callOnFinishChange();
    }
  }

  // --- Number (field or slider) ---
  private _drawNumberWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    if (ctrl._hasSlider) {
      this._drawSliderWidget(ctrl, input, x, y, w, h, renderer);
    } else {
      this._drawNumberFieldWidget(ctrl, input, x, y, w, h, renderer);
    }
  }

  private _drawSliderWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const min = ctrl._min!;
    const max = ctrl._max!;
    const val = Number(ctrl.getValue());
    const fraction = Math.max(0, Math.min(1, (val - min) / (max - min)));

    // Slider track region: left portion for slider, right portion for number display
    const numberDisplayWidth = 50;
    const sliderW = w - numberDisplayWidth - Theme.padding;
    const sliderH = 14;
    const sliderY = y + (h - sliderH) / 2;

    // Track background
    renderer.fillRect(x, sliderY, sliderW, sliderH, Theme.widgetColor);
    // Filled part
    renderer.fillRect(x, sliderY, sliderW * fraction, sliderH, Theme.sliderFilledColor);

    // Number display
    const displayText = ctrl._displayValue();
    renderer.fillText(
      displayText,
      x + sliderW + Theme.padding,
      y + h / 2 + Theme.fontSize * 0.35,
      Theme.numberColor,
      Theme.fontSize,
      'left',
    );

    // Interaction
    if (!ctrl._disabled) {
      const sliderHovered = this._isHovered(input, x, sliderY, sliderW, sliderH);

      if (input.mousePressed && sliderHovered) {
        ctrl._sliderDragging = true;
        this.root._activeController = ctrl;
      }

      if (ctrl._sliderDragging) {
        if (input.mouseDown) {
          let frac = (input.mouseX - x) / sliderW;
          frac = Math.max(0, Math.min(1, frac));
          let newVal = min + frac * (max - min);
          if (ctrl._step !== undefined) {
            newVal = Math.round(newVal / ctrl._step) * ctrl._step;
          }
          newVal = Math.max(min, Math.min(max, newVal));
          ctrl.setValue(newVal);
        }
        if (input.mouseReleased) {
          ctrl._sliderDragging = false;
          this.root._activeController = null;
          ctrl._callOnFinishChange();
        }
      }
    }
  }

  private _drawNumberFieldWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const fieldH = 18;
    const fieldY = y + (h - fieldH) / 2;
    const fieldW = w - Theme.padding;

    renderer.fillRect(x, fieldY, fieldW, fieldH, Theme.widgetColor);

    if (ctrl._editing && this.root._focusedController === ctrl) {
      renderer.strokeRect(x, fieldY, fieldW, fieldH, Theme.sliderFilledColor, 1);
      // Edit text
      renderer.fillText(
        ctrl._editText,
        x + 4,
        y + h / 2 + Theme.fontSize * 0.35,
        Theme.numberColor,
        Theme.fontSize,
        'left',
      );
      // Cursor
      const textBeforeCursor = ctrl._editText.slice(0, ctrl._editCursorPos);
      const cursorX = x + 4 + renderer.measureText(textBeforeCursor, Theme.fontSize).width;
      renderer.fillRect(cursorX, fieldY + 2, 1, fieldH - 4, Theme.textColor);

      // Handle keyboard input
      this._handleTextInput(ctrl, input, true);
    } else {
      renderer.fillText(
        ctrl._displayValue(),
        x + 4,
        y + h / 2 + Theme.fontSize * 0.35,
        Theme.numberColor,
        Theme.fontSize,
        'left',
      );
    }

    // Click to start editing
    if (!ctrl._disabled && input.mousePressed && this._isHovered(input, x, fieldY, fieldW, fieldH)) {
      if (this.root._focusedController && this.root._focusedController !== ctrl) {
        this._finishEditing(this.root._focusedController);
      }
      ctrl._editing = true;
      ctrl._editText = String(ctrl.getValue());
      ctrl._editCursorPos = ctrl._editText.length;
      this.root._focusedController = ctrl;
    } else if (ctrl._editing && input.mousePressed && !this._isHovered(input, x, fieldY, fieldW, fieldH)) {
      this._finishEditing(ctrl);
    }

    // Wheel to adjust
    if (!ctrl._disabled && this._isHovered(input, x, fieldY, fieldW, fieldH) && input.wheelDelta) {
      const stepSize = ctrl._step ?? 1;
      const delta = input.wheelDelta > 0 ? -stepSize : stepSize;
      ctrl.setValue(Number(ctrl.getValue()) + delta);
      ctrl._callOnFinishChange();
    }
  }

  // --- String (text field) ---
  private _drawStringWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const fieldH = 18;
    const fieldY = y + (h - fieldH) / 2;
    const fieldW = w - Theme.padding;

    renderer.fillRect(x, fieldY, fieldW, fieldH, Theme.widgetColor);

    if (ctrl._editing && this.root._focusedController === ctrl) {
      renderer.strokeRect(x, fieldY, fieldW, fieldH, Theme.sliderFilledColor, 1);
      // Draw with clip so text doesn't overflow
      renderer.pushClip({ x, y: fieldY, width: fieldW, height: fieldH });
      renderer.fillText(
        ctrl._editText,
        x + 4,
        y + h / 2 + Theme.fontSize * 0.35,
        Theme.stringColor,
        Theme.fontSize,
        'left',
      );
      // Cursor
      const textBeforeCursor = ctrl._editText.slice(0, ctrl._editCursorPos);
      const cursorX = x + 4 + renderer.measureText(textBeforeCursor, Theme.fontSize).width;
      renderer.fillRect(cursorX, fieldY + 2, 1, fieldH - 4, Theme.textColor);
      renderer.popClip();

      this._handleTextInput(ctrl, input, false);
    } else {
      renderer.pushClip({ x, y: fieldY, width: fieldW, height: fieldH });
      renderer.fillText(
        String(ctrl.getValue()),
        x + 4,
        y + h / 2 + Theme.fontSize * 0.35,
        Theme.stringColor,
        Theme.fontSize,
        'left',
      );
      renderer.popClip();
    }

    if (!ctrl._disabled && input.mousePressed && this._isHovered(input, x, fieldY, fieldW, fieldH)) {
      if (this.root._focusedController && this.root._focusedController !== ctrl) {
        this._finishEditing(this.root._focusedController);
      }
      ctrl._editing = true;
      ctrl._editText = String(ctrl.getValue());
      ctrl._editCursorPos = ctrl._editText.length;
      this.root._focusedController = ctrl;
    } else if (ctrl._editing && input.mousePressed && !this._isHovered(input, x, fieldY, fieldW, fieldH)) {
      this._finishEditing(ctrl);
    }
  }

  // --- Function (button) ---
  private _drawFunctionWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    // Row background + separator
    renderer.fillRect(x, y, w, h, Theme.backgroundColor);
    renderer.fillRect(x, y + h - 1, w, 1, Theme.folderBackgroundColor);

    // Button with padding and distinct color
    const pad = 4;
    const btnX = x + pad;
    const btnY = y + pad;
    const btnW = w - pad * 2;
    const btnH = h - pad * 2;
    const hovered = this._isHovered(input, btnX, btnY, btnW, btnH);
    const btnColor = hovered && !ctrl._disabled ? Theme.widgetHoverColor : Theme.widgetColor;
    renderer.fillRect(btnX, btnY, btnW, btnH, btnColor);

    // Center text
    renderer.fillText(
      ctrl._name,
      x + w / 2,
      y + h / 2 + Theme.fontSize * 0.35,
      ctrl._disabled ? Theme.disabledTextColor : Theme.textColor,
      Theme.fontSize,
      'center',
    );

    if (!ctrl._disabled && input.mousePressed && hovered) {
      const fn = ctrl.getValue();
      if (typeof fn === 'function') {
        fn.call(ctrl.object);
      }
      ctrl._callOnChange();
      ctrl._callOnFinishChange();
    }
  }

  // --- Option (dropdown) ---
  private _drawOptionWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const fieldH = 18;
    const fieldY = y + (h - fieldH) / 2;
    const fieldW = w - Theme.padding;

    renderer.fillRect(x, fieldY, fieldW, fieldH, Theme.widgetColor);

    // Current value text
    renderer.pushClip({ x, y: fieldY, width: fieldW, height: fieldH });
    renderer.fillText(
      ctrl._displayValue(),
      x + 4,
      y + h / 2 + Theme.fontSize * 0.35,
      Theme.textColor,
      Theme.fontSize,
      'left',
    );
    renderer.popClip();

    // Dropdown arrow (up/down)
    _drawUpDownArrows(renderer, x + fieldW - 14, y + h / 2, Theme.textMutedColor);

    // Click to open dropdown
    if (!ctrl._disabled && input.mousePressed && this._isHovered(input, x, fieldY, fieldW, fieldH)) {
      // Close other dropdowns
      for (const c of this.root.controllersRecursive()) {
        if (c !== ctrl) c._dropdownOpen = false;
      }
      ctrl._dropdownOpen = !ctrl._dropdownOpen;
      ctrl._dropdownHoveredIndex = -1;
    }
  }

  /** Draw dropdown overlay (after main GUI draw) */
  private _drawDropdownOverlay(
    ctrl: Controller, input: InputState, renderer: GUIRenderer,
  ) {
    const pos = this._findControllerPosition(ctrl);
    if (!pos) { ctrl._dropdownOpen = false; return; }

    const { x, y, width } = pos;
    const nameW = width * Theme.nameWidth;
    const widgetX = x + nameW;
    const widgetW = width - nameW - Theme.padding;
    const dropdownY = y + Theme.rowHeight;

    const itemH = Theme.rowHeight;
    const count = ctrl._optionLabels.length;
    const dropdownH = count * itemH;

    // Track overlay area for external hit-testing
    this._overlayAreas.push({ x: widgetX, y: dropdownY, w: widgetW, h: dropdownH });

    // Background
    renderer.fillRect(widgetX, dropdownY, widgetW, dropdownH, '#2a2a2a');
    renderer.strokeRect(widgetX, dropdownY, widgetW, dropdownH, Theme.borderColor, 1);

    for (let i = 0; i < count; i++) {
      const iy = dropdownY + i * itemH;
      const hovered = this._isHovered(input, widgetX, iy, widgetW, itemH);
      if (hovered) {
        ctrl._dropdownHoveredIndex = i;
        renderer.fillRect(widgetX, iy, widgetW, itemH, Theme.widgetHoverColor);
      }

      const isSelected = ctrl._optionValues[i] === ctrl.getValue();
      renderer.fillText(
        ctrl._optionLabels[i],
        widgetX + 4,
        iy + itemH / 2 + Theme.fontSize * 0.35,
        isSelected ? Theme.sliderFilledColor : Theme.textColor,
        Theme.fontSize,
        'left',
      );

      if (input.mousePressed && hovered) {
        ctrl.setValue(ctrl._optionValues[i]);
        ctrl._callOnFinishChange();
        ctrl._dropdownOpen = false;
      }
    }

    // Close dropdown when clicking outside (excluding the controller's own row which toggles it)
    if (input.mousePressed
        && !this._isHovered(input, widgetX, dropdownY, widgetW, dropdownH)
        && !this._isHovered(input, x, y, width, Theme.rowHeight)) {
      ctrl._dropdownOpen = false;
    }
  }

  // --- Color ---
  private _drawColorWidget(
    ctrl: Controller, input: InputState,
    x: number, y: number, w: number, h: number, renderer: GUIRenderer,
  ) {
    const swatchSize = 18;
    const swatchX = x + Theme.padding;
    const swatchY = y + (h - swatchSize) / 2;

    const hexColor = parseColor(ctrl.getValue(), ctrl._rgbScale);
    renderer.fillRect(swatchX, swatchY, swatchSize, swatchSize, hexColor);
    renderer.strokeRect(swatchX, swatchY, swatchSize, swatchSize, Theme.colorSwatchBorderColor, 1);

    // Hex text
    renderer.fillText(
      hexColor,
      swatchX + swatchSize + 6,
      y + h / 2 + Theme.fontSize * 0.35,
      Theme.textColor,
      Theme.fontSize,
      'left',
    );

    // Click to toggle color picker
    if (!ctrl._disabled && input.mousePressed && this._isHovered(input, x, y, w, h)) {
      if (this.root._colorPickerActive === ctrl) {
        ctrl._colorPickerOpen = !ctrl._colorPickerOpen;
        if (!ctrl._colorPickerOpen) {
          this.root._colorPickerActive = null;
          ctrl._callOnFinishChange();
        }
      } else {
        // Close any other color picker
        if (this.root._colorPickerActive) {
          this.root._colorPickerActive._colorPickerOpen = false;
          this.root._colorPickerActive._callOnFinishChange();
        }
        ctrl._colorPickerOpen = true;
        this.root._colorPickerActive = ctrl;
        ctrl._colorHSV = hexToHSV(hexColor);
      }
    }
  }

  /** Draw the color picker popup */
  private _drawColorPicker(ctrl: Controller, input: InputState, renderer: GUIRenderer) {
    const pos = this._findControllerPosition(ctrl);
    if (!pos) { ctrl._colorPickerOpen = false; this.root._colorPickerActive = null; return; }

    const pickerW = 200;
    const pickerH = 180;
    const hueBarH = 16;
    const px = pos.x + pos.width - pickerW;
    const py = pos.y + Theme.rowHeight + 2;

    // Track overlay area for external hit-testing
    this._overlayAreas.push({ x: px, y: py, w: pickerW, h: pickerH });

    // Background
    renderer.fillRect(px, py, pickerW, pickerH, '#1a1a1a');
    renderer.strokeRect(px, py, pickerW, pickerH, Theme.borderColor, 1);

    // SV field
    const svX = px + 4;
    const svY = py + 4;
    const svW = pickerW - 8;
    const svH = pickerH - hueBarH - 16;

    // Draw SV gradient approximation with filled rects
    const steps = 20;
    const cellW = svW / steps;
    const cellH = svH / steps;
    for (let si = 0; si < steps; si++) {
      for (let vi = 0; vi < steps; vi++) {
        const s = si / (steps - 1);
        const v = 1 - vi / (steps - 1);
        const color = hsvToHex(ctrl._colorHSV.h, s, v);
        renderer.fillRect(svX + si * cellW, svY + vi * cellH, cellW + 1, cellH + 1, color);
      }
    }

    // SV cursor
    const cursorSX = svX + ctrl._colorHSV.s * svW;
    const cursorSY = svY + (1 - ctrl._colorHSV.v) * svH;
    renderer.strokeRect(cursorSX - 4, cursorSY - 4, 8, 8, '#ffffff', 2);
    renderer.strokeRect(cursorSX - 3, cursorSY - 3, 6, 6, '#000000', 1);

    // Hue bar
    const hueBarY = py + pickerH - hueBarH - 4;
    const hueSteps = 30;
    const hueCellW = svW / hueSteps;
    for (let i = 0; i < hueSteps; i++) {
      const hue = i / hueSteps;
      renderer.fillRect(svX + i * hueCellW, hueBarY, hueCellW + 1, hueBarH, hsvToHex(hue, 1, 1));
    }
    // Hue cursor
    const hueCursorX = svX + ctrl._colorHSV.h * svW;
    renderer.strokeRect(hueCursorX - 2, hueBarY - 1, 4, hueBarH + 2, '#ffffff', 2);

    // Interaction
    if (!ctrl._disabled) {
      // SV area interaction
      if (input.mouseDown && this._isHovered(input, svX, svY, svW, svH)) {
        ctrl._colorHSV.s = Math.max(0, Math.min(1, (input.mouseX - svX) / svW));
        ctrl._colorHSV.v = Math.max(0, Math.min(1, 1 - (input.mouseY - svY) / svH));
        const newHex = hsvToHex(ctrl._colorHSV.h, ctrl._colorHSV.s, ctrl._colorHSV.v);
        const newVal = writeColorBack(ctrl.getValue(), newHex, ctrl._rgbScale);
        ctrl.object[ctrl.property] = newVal;
        ctrl._callOnChange();
      }

      // Hue bar interaction
      if (input.mouseDown && this._isHovered(input, svX, hueBarY, svW, hueBarH)) {
        ctrl._colorHSV.h = Math.max(0, Math.min(1, (input.mouseX - svX) / svW));
        const newHex = hsvToHex(ctrl._colorHSV.h, ctrl._colorHSV.s, ctrl._colorHSV.v);
        const newVal = writeColorBack(ctrl.getValue(), newHex, ctrl._rgbScale);
        ctrl.object[ctrl.property] = newVal;
        ctrl._callOnChange();
      }

      // Close picker on click outside (excluding the controller's own row which toggles it)
      if (input.mousePressed
          && !this._isHovered(input, px, py, pickerW, pickerH)
          && !this._isHovered(input, pos.x, pos.y, pos.width, Theme.rowHeight)) {
        ctrl._colorPickerOpen = false;
        this.root._colorPickerActive = null;
        ctrl._callOnFinishChange();
      }
    }
  }

  // --- Text input handling ---

  private _handleTextInput(ctrl: Controller, input: InputState, isNumber: boolean) {
    if (!ctrl._editing) return;

    if (input.keysPressed) {
      for (const key of input.keysPressed) {
        switch (key) {
          case 'Enter':
            this._finishEditing(ctrl);
            return;
          case 'Escape':
            ctrl._editing = false;
            if (this.root._focusedController === ctrl) this.root._focusedController = null;
            return;
          case 'Backspace':
            if (ctrl._editCursorPos > 0) {
              ctrl._editText = ctrl._editText.slice(0, ctrl._editCursorPos - 1) + ctrl._editText.slice(ctrl._editCursorPos);
              ctrl._editCursorPos--;
            }
            break;
          case 'Delete':
            if (ctrl._editCursorPos < ctrl._editText.length) {
              ctrl._editText = ctrl._editText.slice(0, ctrl._editCursorPos) + ctrl._editText.slice(ctrl._editCursorPos + 1);
            }
            break;
          case 'ArrowLeft':
            ctrl._editCursorPos = Math.max(0, ctrl._editCursorPos - 1);
            break;
          case 'ArrowRight':
            ctrl._editCursorPos = Math.min(ctrl._editText.length, ctrl._editCursorPos + 1);
            break;
          case 'Home':
            ctrl._editCursorPos = 0;
            break;
          case 'End':
            ctrl._editCursorPos = ctrl._editText.length;
            break;
        }
      }
    }

    if (input.textInput) {
      let chars = input.textInput;
      if (isNumber) {
        // Only allow number-related characters
        chars = chars.replace(/[^0-9.\-e]/g, '');
      }
      if (chars.length > 0) {
        ctrl._editText = ctrl._editText.slice(0, ctrl._editCursorPos) + chars + ctrl._editText.slice(ctrl._editCursorPos);
        ctrl._editCursorPos += chars.length;
      }
    }
  }

  private _finishEditing(ctrl: Controller) {
    if (!ctrl._editing) return;
    ctrl._editing = false;
    if (this.root._focusedController === ctrl) this.root._focusedController = null;

    if (ctrl._type === 'number') {
      const num = parseFloat(ctrl._editText);
      if (!isNaN(num)) {
        ctrl.setValue(num);
        ctrl._callOnFinishChange();
      }
    } else if (ctrl._type === 'string') {
      ctrl.setValue(ctrl._editText);
      ctrl._callOnFinishChange();
    }
  }

  // --- Scrolling ---

  private _handleScroll(input: InputState) {
    if (this._contentHeight <= this._visibleHeight) {
      this._scrollY = 0;
      return;
    }

    // Mouse wheel scrolling
    if (this._isHovered(input, this._x, this._y, this._width, this._visibleHeight) && input.wheelDelta) {
      // Only scroll if no controller is handling the wheel
      if (!this.root._focusedController) {
        this._scrollY += input.wheelDelta;
        this._scrollY = Math.max(0, Math.min(this._contentHeight - this._visibleHeight, this._scrollY));
      }
    }

    // Scrollbar dragging
    if (this._scrollbarDragging) {
      if (input.mouseDown) {
        const trackH = this._visibleHeight;
        const thumbH = Math.max(20, (this._visibleHeight / this._contentHeight) * trackH);
        const scrollableTrack = trackH - thumbH;
        const dy = input.mouseY - this._scrollbarDragStartY;
        const scrollRange = this._contentHeight - this._visibleHeight;
        this._scrollY = this._scrollbarDragStartScroll + (dy / scrollableTrack) * scrollRange;
        this._scrollY = Math.max(0, Math.min(scrollRange, this._scrollY));
      }
      if (input.mouseReleased) {
        this._scrollbarDragging = false;
      }
    }
  }

  private _drawScrollbar(renderer: GUIRenderer, input: InputState) {
    const trackX = this._x + this._width - Theme.scrollbarWidth;
    const trackY = this._y;
    const trackH = this._visibleHeight;
    const thumbH = Math.max(20, (this._visibleHeight / this._contentHeight) * trackH);
    const scrollRange = this._contentHeight - this._visibleHeight;
    const thumbY = trackY + (this._scrollY / scrollRange) * (trackH - thumbH);

    const hovered = this._isHovered(input, trackX, thumbY, Theme.scrollbarWidth, thumbH);
    const color = hovered || this._scrollbarDragging ? Theme.scrollbarHoverColor : Theme.scrollbarColor;
    renderer.fillRect(trackX, thumbY, Theme.scrollbarWidth, thumbH, color);

    if (input.mousePressed && hovered) {
      this._scrollbarDragging = true;
      this._scrollbarDragStartY = input.mouseY;
      this._scrollbarDragStartScroll = this._scrollY;
    }
  }

  // --- Utilities ---

  private _isHovered(input: InputState, x: number, y: number, w: number, h: number): boolean {
    return input.mouseX >= x && input.mouseX < x + w && input.mouseY >= y && input.mouseY < y + h;
  }

  /** Find the screen-space position of a controller for overlays */
  private _findControllerPosition(ctrl: Controller): { x: number; y: number; width: number } | null {
    let cursorY = this._y - this._scrollY;
    return this._findControllerInGUI(this, ctrl, this._x, cursorY, this._width);
  }

  private _findControllerInGUI(gui: GUI, target: Controller, x: number, y: number, width: number): { x: number; y: number; width: number } | null {
    y += Theme.titleBarHeight;
    if (gui._closed) return null;

    const isFolder = gui.parent !== undefined;
    const contentX = isFolder ? x + Theme.indentWidth : x;
    const contentW = isFolder ? width - Theme.indentWidth : width;

    for (const child of gui.children) {
      if (child instanceof Controller) {
        if (child._hidden) continue;
        if (child === target) {
          return { x: contentX, y, width: contentW };
        }
        y += Theme.rowHeight;
      } else {
        if (child._hidden) continue;
        const result = this._findControllerInGUI(child, target, contentX, y, contentW);
        if (result) return result;
        y += this._calcGUIHeight(child);
      }
    }
    return null;
  }
}

export default GUI;
