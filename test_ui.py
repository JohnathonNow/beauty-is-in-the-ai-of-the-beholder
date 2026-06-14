from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"file://{os.path.abspath('frontend/index.html')}")

        page.evaluate('''
            const login = document.getElementById("login");
            if (login) login.style.display = "none";
            const lobby = document.getElementById("lobby");
            if (lobby) lobby.style.display = "none";
            const game = document.getElementById("game");
            if (game) game.style.display = "flex";
            const drawing_workspace = document.getElementById("drawing-workspace");
            if (drawing_workspace) drawing_workspace.style.display = "flex";
            window.game_state = "DRAWING";
            window.sendDrawing = function() {};
            if (window.timerInterval) clearInterval(window.timerInterval);
        ''')

        # Test drawing loads and select tools
        page.evaluate('''
            if (typeof onload_drawing !== "undefined") onload_drawing();
            if (typeof on_visible !== "undefined") on_visible();
            if (typeof strokes !== "undefined") {
                strokes.push({
                    "x": 250, "y": 250, "c": "#000000", "size": 40, "font": "Arial", "text": "Hello World", "rotation": 0, "o": "text", "t": 0
                });
                redraw();
            }
        ''')

        page.click("#text")

        page.evaluate('''
            const canvas = document.getElementById("canvas");
            const rect = canvas.getBoundingClientRect();
            const b = parseInt(getComputedStyle(canvas).getPropertyValue('border-left-width')) || 0;
            const x = rect.left + b + (250 * canvas.clientWidth / 1000);
            const y = rect.top + b + (250 * canvas.clientHeight / 1000);

            const e = new MouseEvent('mousedown', {
                clientX: x,
                clientY: y,
                buttons: 1
            });
            canvas.dispatchEvent(e);

            const up = new MouseEvent('mouseup', {
                clientX: x,
                clientY: y,
            });
            canvas.dispatchEvent(up);
        ''')
        time.sleep(0.5)

        page.screenshot(path="screenshot2.png")

        browser.close()

if __name__ == "__main__":
    run()
