/**
 * Retina screenshot harness — loads the game, seeks race moments, captures camera angles.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../artifacts/screenshots');

async function waitReady(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __CEL_RACER__?: { ready: boolean } }).__CEL_RACER__?.ready === true, {
    timeout: 60_000,
  });
  // Let a few frames render
  await page.waitForTimeout(500);
}

test.describe('CELWAKE visual harness', () => {
  test('capture mid-race angles at retina', async ({ page }) => {
    await waitReady(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __CEL_RACER__: { seekRace: (p: string) => void; setTime: (t: number) => void; setCamera: (m: string) => void } }).__CEL_RACER__;
      api.seekRace('midlap');
      api.setTime(12.5);
    });
    await page.waitForTimeout(800);

    const angles = ['chase', 'aerial', 'bow', 'orbit'] as const;
    for (const mode of angles) {
      await page.evaluate((m) => {
        (window as unknown as { __CEL_RACER__: { setCamera: (x: string) => void; setTime: (t: number) => void } }).__CEL_RACER__.setCamera(m);
        (window as unknown as { __CEL_RACER__: { setTime: (t: number) => void } }).__CEL_RACER__.setTime(12.5 + (m === 'orbit' ? 0.4 : 0));
      }, mode);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(outDir, `midlap-${mode}.png`),
        fullPage: false,
      });
    }

    // Headless CI is slower than target M5 Pro Chrome; only assert API health here.
    const perf = await page.evaluate(() =>
      (window as unknown as { __CEL_RACER__: { getPerf: () => { fps: number; drawCalls: number } } }).__CEL_RACER__.getPerf(),
    );
    expect(perf.drawCalls).toBeGreaterThan(0);
  });

  test('capture countdown and finish', async ({ page }) => {
    await waitReady(page);

    await page.evaluate(() => {
      const api = (window as unknown as { __CEL_RACER__: { seekRace: (p: string) => void; setTime: (t: number) => void } }).__CEL_RACER__;
      api.seekRace('countdown');
      api.setTime(2.0);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'countdown-orbit.png') });

    await page.evaluate(() => {
      const api = (window as unknown as { __CEL_RACER__: { seekRace: (p: string) => void; setTime: (t: number) => void } }).__CEL_RACER__;
      api.seekRace('finish');
      api.setTime(20);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'finish-results.png') });
  });

  test('ocean-only atmosphere frame', async ({ page }) => {
    await waitReady(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __CEL_RACER__: { seekRace: (p: string) => void; setCamera: (m: string) => void; setTime: (t: number) => void } }).__CEL_RACER__;
      api.seekRace('midlap');
      api.setCamera('aerial');
      api.setTime(18.0);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'ocean-aerial.png') });
  });
});
