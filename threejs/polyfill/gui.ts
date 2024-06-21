// TODO?: support lil-gui of three.js
export class GUI {
    add() {
        return new Item;
    }

    addFolder() {
        return {
            add() { }
        }
    }

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
}
