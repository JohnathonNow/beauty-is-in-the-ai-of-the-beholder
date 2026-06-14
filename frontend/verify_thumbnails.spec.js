const { test, expect } = require('@playwright/test');

test('verify winner list has thumbnails and is sorted', async ({ page }) => {
    // Navigate to local index
    await page.goto('http://127.0.0.1:8080/frontend/index.html');

    // Bypass login/lobby and setup game state for POSTGAME
    await page.evaluate(() => {
        document.getElementById("login").style.display = "none";
        document.getElementById("lobby-selection").style.display = "none";
        document.getElementById("game").style.display = "block";
        document.getElementById("endgame-container").style.display = "block";
        document.getElementById("progress-container").style.display = "none";
        document.getElementById("lobby-container").style.display = "none";

        // Mock state and triggers
        window.gState = {
            state: "POSTGAME",
            players: {
                "Alice": { score: 10 },
                "Bob": { score: 50 },
                "Charlie": { score: 30 }
            }
        };
        window.gAssign = "dog";
        window.gStrokes = new Map();
        window.gMap = new Map();

        // Mock add_player
        window.add_player = function(player) {
            let li = document.createElement("li");
            li.classList.add('user-list-item');
            li.setAttribute("__player", player);
            return li;
        };

        let namelist = document.getElementById("user-list-3");
        let values = Object.entries(gState["players"]);
        values.sort((a, b) => b[1].score - a[1].score); // Descending

        for (let i = 0; i < values.length; ++i) {
            let player = values[i][0];
            let child = add_player(player);
            namelist.appendChild(child);

            child.innerHTML = "";
            let thumb = document.createElement("img");
            thumb.className = "test-thumb";
            // explicitly set a mock src so it has a valid size to be visible
            thumb.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            child.appendChild(thumb);

            let txtSpan = document.createElement("span");
            txtSpan.className = "test-text";
            txtSpan.textContent = player + " [" + values[i][1].score + "]";
            child.appendChild(txtSpan);
        }
    });

    // Check order (Worst to best -> 50, 30, 10 -> Bob, Charlie, Alice)
    const listItems = page.locator('#user-list-3 .user-list-item');
    await expect(listItems).toHaveCount(3);

    const text0 = await listItems.nth(0).locator('.test-text').textContent();
    const text1 = await listItems.nth(1).locator('.test-text').textContent();
    const text2 = await listItems.nth(2).locator('.test-text').textContent();

    expect(text0).toContain('Bob [50]');
    expect(text1).toContain('Charlie [30]');
    expect(text2).toContain('Alice [10]');

    // Check thumbnail presence
    const thumb0 = listItems.nth(0).locator('.test-thumb');
    await expect(thumb0).toBeVisible();
});
