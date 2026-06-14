// Mocking some state to test the show_winners logic
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><ul id="user-list-3"></ul><div id="finalgallery"></div>`);
global.document = dom.window.document;

global.gState = {
    players: {
        "Alice": {score: 50},
        "Bob": {score: 10},
        "Charlie": {score: 90}
    }
};

let values = Object.entries(gState["players"]);
console.log("Original:", values.map(x => x[0] + ":" + x[1].score));
values.sort((a, b) => b[1].score - a[1].score);
console.log("Sorted worst to best (highest score to lowest):", values.map(x => x[0] + ":" + x[1].score));
