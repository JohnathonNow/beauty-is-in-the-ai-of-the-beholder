const { test, expect } = require('@playwright/test');

test('verify lobby gamemode UI', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/frontend/index.html');

    // Make the UI visible (usually login page hides it first)
    await page.evaluate(() => {
        document.getElementById("login").style.display = "none";
        document.getElementById("lobby-selection").style.display = "block";
    });

    // Click 'Create Lobby' to show section
    await page.click('#show-create-lobby-btn');

    // Ensure the new-lobby-mode dropdown exists and has the expected options
    const modeDropdown = page.locator('#new-lobby-mode');
    await expect(modeDropdown).toBeVisible();

    // Select AI
    await modeDropdown.selectOption('AI');
    expect(await modeDropdown.inputValue()).toBe('AI');

    // Select Classic
    await modeDropdown.selectOption('Classic');
    expect(await modeDropdown.inputValue()).toBe('Classic');
});
