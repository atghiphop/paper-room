import { mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const outputDir = new URL("../output/playwright/", import.meta.url);

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="puzzle-1"]');

  const firstCode = ((await page.getByTestId("hidden-code").textContent()) || "").trim();
  const alternateCode = `${firstCode[0]}${firstCode[2]}${firstCode[1]}`;
  if (alternateCode.length !== firstCode.length) throw new Error("Could not build alternate room 1 code");
  for (const letter of alternateCode) {
    await page.getByTestId(`key-${letter}`).click();
  }
  await page.waitForFunction(() => document.querySelector("#answerButton")?.textContent?.toLowerCase().includes("next"));
  await page.locator("#resetPuzzleButton").click();
  await page.waitForFunction(() => document.querySelector("#answerButton")?.textContent?.trim().toLowerCase() === "reveal");

  for (let room = 1; room <= 10; room += 1) {
    console.log(`Solving puzzle ${room}`);
    await page.waitForSelector(`[data-testid="puzzle-${room}"]`);
    const pieces = await page.locator("[data-piece-id]").evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.dataset.pieceId,
        targetX: Number(element.dataset.targetX),
        targetY: Number(element.dataset.targetY),
        z: Number(element.dataset.z),
      })).sort((a, b) => b.z - a.z),
    );

    const boardBox = await page.getByTestId("board").boundingBox();
    if (!boardBox) throw new Error(`Missing board in puzzle ${room}`);

    for (const piece of pieces) {
      const locator = page.getByTestId(`piece-${piece.id}`);
      const start = await locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          x: Number.parseFloat(style.getPropertyValue("--x")),
          y: Number.parseFloat(style.getPropertyValue("--y")),
        };
      });
      if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) throw new Error(`Missing piece ${piece.id}`);
      const startX = boardBox.x + (boardBox.width * start.x) / 100;
      const startY = boardBox.y + (boardBox.height * start.y) / 100;
      const targetX = boardBox.x + (boardBox.width * piece.targetX) / 100;
      const targetY = boardBox.y + (boardBox.height * piece.targetY) / 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 12 });
      await page.mouse.up();
    }

    await page.waitForFunction(() => document.querySelector('[data-testid="hidden-code"]')?.dataset.revealed === "true");
    const code = (await page.getByTestId("hidden-code").textContent())?.trim();
    if (!code) throw new Error(`No code revealed in puzzle ${room}`);

    for (const letter of code) {
      await page.getByTestId(`key-${letter}`).click();
    }

    await page.waitForFunction(() => document.querySelector("#answerButton")?.textContent?.toLowerCase().includes("next") || document.querySelector("#answerButton")?.textContent?.toLowerCase().includes("finish"));
    await page.locator("#answerButton").click();
  }

  await page.waitForSelector('[data-testid="final-screen"]');
  await page.screenshot({ path: new URL("mobile-complete.png", outputDir).pathname, fullPage: true });
} finally {
  await browser.close();
}
