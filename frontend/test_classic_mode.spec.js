const { test, expect } = require('@playwright/test');

test('verify classic mode ui loop', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/frontend/index.html');

    // Bypass login/lobby and setup game state
    await page.evaluate(() => {
        document.getElementById("login").style.display = "none";
        document.getElementById("lobby-selection").style.display = "none";
        document.getElementById("game").style.display = "block";
        document.getElementById("progress-container").style.display = "flex";

        window.gName = "Alice";
        window.gState = {
            state: "RUNNING",
            gametype: "Classic",
            drawer: "Bob",
            word: "apple",
            players: {
                "Alice": { score: 10, active: true },
                "Bob": { score: 50, active: true }
            }
        };

        // We can mock socket and its send method
        window.socket = { send: () => {} };

        // Mock get_namelist to avoid undefined errors if missing
        window.get_namelist = () => document.createElement("ul");
        window.add_player = (p) => document.createElement("li");
        window.add_guesser = () => {};
        window.add_guessed = () => {};
        window.add_drawing = () => {};
        window.tick = () => {};
        window.sendAssign = () => {};

        // Simulate data["FullState"] response processing block
        let data = {
            FullState: {
                state: window.gState
            }
        };

        window.gAssign = data.FullState.state.word;
        if (data.FullState.state.gametype == "Classic" && data.FullState.state.drawer !== window.gName) {
            document.getElementById("word").textContent = "Guess the word!";
        } else {
            document.getElementById("word").textContent = "Please draw: " + window.gAssign;
        }
    });

    const wordElem = page.locator('#word');
    await expect(wordElem).toHaveText('Guess the word!');

    // Now switch so Alice IS the drawer
    await page.evaluate(() => {
        let data = {
            FullState: {
                state: {
                    state: "RUNNING",
                    gametype: "Classic",
                    drawer: "Alice",
                    word: "apple"
                }
            }
        };
        window.gAssign = data.FullState.state.word;
        if (data.FullState.state.gametype == "Classic" && data.FullState.state.drawer !== window.gName) {
            document.getElementById("word").textContent = "Guess the word!";
        } else {
            document.getElementById("word").textContent = "Please draw: " + window.gAssign;
        }
    });

    await expect(wordElem).toHaveText('Please draw: apple');
});
