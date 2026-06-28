const { test, expect } = require('@playwright/test');

test.describe('Game Modes UI Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Mock WebSocket before page loads so we can simulate server messages
        await page.addInitScript(() => {
            window.mockWsInstance = null;
            class MockWebSocket {
                constructor(url) {
                    this.url = url;
                    this.readyState = 1; // OPEN
                    setTimeout(() => {
                        if (this.onopen) this.onopen();
                    }, 0);
                    window.mockWsInstance = this;
                }
                addEventListener(event, handler) {
                    if (event === 'message') {
                        this.onmessage = handler;
                    }
                }
                send(data) {
                    console.log("Mock WS send:", data);
                }
                close() {}
            }
            window.OriginalWebSocket = window.WebSocket;
            window.WebSocket = MockWebSocket;

            window.sendMockMessage = (msgObj) => {
                if (window.mockWsInstance && window.mockWsInstance.onmessage) {
                    window.mockWsInstance.onmessage({ data: JSON.stringify(msgObj) });
                }
            };
        });

        await page.goto('http://127.0.0.1:8080/frontend/index.html');

        // Mock the fetch to /lobbies so we don't need the actual server
        await page.route('**/lobbies', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        }));

        // Mock fetch to global_chat?name=Alice
        await page.route('**/global_chat*', route => {
            if (route.request().url().startsWith('ws')) {
               // Playwright route doesn't intercept WS directly like this if it's new WebSocket,
               // but we mocked WebSocket already.
            }
            route.continue();
        });
    });

    test('verify AI mode UI loop correctly displays word', async ({ page }) => {
        // Login
        await page.fill('#name', 'Alice');
        await page.press('#name', 'Enter');

        // Create Lobby and Connect
        await page.click('#show-create-lobby-btn');
        await page.fill('#new-lobby-name', 'TestLobbyAI');
        await page.selectOption('#new-lobby-mode', 'AI');
        await page.click('#create-lobby');

        // Wait for the UI to switch to the game view
        await expect(page.locator('#game')).toBeVisible();

        // Simulate server sending FullState for AI mode (RUNNING)
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "AI",
                        "drawer": "Alice",
                        "word": "robot", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        // In AI mode, everyone draws, so the prompt should say "Please draw: robot"
        const wordElem = page.locator('#word');
        await expect(wordElem).toHaveText('Please draw: robot');

        // Simulate drawer changing to Bob (which shouldn't matter in AI mode)
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "AI",
                        "drawer": "Bob",
                        "word": "cyborg", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        await expect(wordElem).toHaveText('Please draw: cyborg');
    });

    test('verify Classic mode UI loop correctly switches drawer/guesser', async ({ page }) => {
        // Login
        await page.fill('#name', 'Alice');
        await page.press('#name', 'Enter');

        // Create Lobby and Connect
        await page.click('#show-create-lobby-btn');
        await page.fill('#new-lobby-name', 'TestLobbyClassic');
        await page.selectOption('#new-lobby-mode', 'Classic');
        await page.click('#create-lobby');

        // Wait for the UI to switch to the game view
        await expect(page.locator('#game')).toBeVisible();

        // Simulate server sending FullState for Classic mode with Alice as drawer
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "Classic",
                        "drawer": "Alice",
                        "word": "apple", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        const wordElem = page.locator('#word');
        await expect(wordElem).toHaveText('Please draw: apple');

        // Simulate server sending FullState for Classic mode with Bob as drawer (Alice is guesser)
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "Classic",
                        "drawer": "Bob",
                        "word": "banana", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        // Alice is guesser, so she should see "Guess the word!"
        await expect(wordElem).toHaveText('Guess the word!');
    });

    test('verify Evolution mode UI loop correctly switches drawer/guesser but retains canvas', async ({ page }) => {
        // Login
        await page.fill('#name', 'Alice');
        await page.press('#name', 'Enter');

        // Create Lobby and Connect
        await page.click('#show-create-lobby-btn');
        await page.fill('#new-lobby-name', 'TestLobbyEvolution');
        await page.selectOption('#new-lobby-mode', 'Evolution');
        await page.click('#create-lobby');

        // Wait for the UI to switch to the game view
        await expect(page.locator('#game')).toBeVisible();

        // Simulate server sending FullState for Evolution mode with Alice as drawer
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "Evolution",
                        "drawer": "Alice",
                        "word": "apple", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        const wordElem = page.locator('#word');
        await expect(wordElem).toHaveText('Please draw: apple');

        // Draw a red pixel at 0,0 on the canvas using strokes logic so redraw() doesn't overwrite it
        await page.evaluate(() => {
            if (typeof strokes !== 'undefined') {
                strokes.push({
                    "x": 0, "y": 0, "c": "red", "s": 5, "m": "source-over", "o": "paint", "t": 1, "d": false
                });
                strokes.push({
                    "x": 10, "y": 10, "c": "red", "s": 5, "m": "source-over", "o": "paint", "t": 1, "d": true
                });
                redraw();
            }
        });

        // Simulate server sending FullState for Evolution mode with Bob as drawer (Alice is guesser)
        await page.evaluate(() => {
            window.sendMockMessage({
                "FullState": {
                    "state": {
                        "state": "RUNNING",
                        "gametype": "Evolution",
                        "drawer": "Bob",
                        "word": "banana", "timelimit": 60, "time": 30 ,
                        "players": {
                            "Alice": { "score": 10, "active": true, "image_path": null },
                            "Bob": { "score": 20, "active": true, "image_path": null }
                        }
                    }
                }
            });
        });

        // Alice is guesser, so she should see "Guess the word!"
        await expect(wordElem).toHaveText('Guess the word!');

        // The red pixel should still be there because clear_canvas() is skipped in Evolution mode for subsequent turns
        const pixel = await page.evaluate(() => {
            const canvas = document.getElementById("canvas");
            const ctx = canvas.getContext("2d");
            const pixelData = ctx.getImageData(0, 0, 1, 1).data;
            return Array.from(pixelData);
        });
        const pixelStillThere = pixel[0] === 255 && pixel[1] === 0 && pixel[2] === 0;

        expect(pixelStillThere).toBe(true);
    });
});
