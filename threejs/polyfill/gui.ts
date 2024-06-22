// TODO?: support lil-gui of three.js
export class GUI {
    domElement = {
        style: {}
    }

    add() {
        return new Item;
    }

    addFolder() {
        return {
            add() { }
        }
    }

    addColor() {
        return new Item;
    }

    open() { }

    close() { }

    static update() {

    }
}

class Item {
    step() {
        return this;
    }
    onChange() {
        return this;
    }
    name() {
        return this;
    }
    min() {
        return this;
    }
    max() {
        return this;
    }
    listen() {
        return this;
    }
}
