import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { cameraArgs, consent, fakeTracker, instrumentCamera, openEnrollment } from './helpers/enrollment.mjs'

const screenshots = 'node_modules/.cache/enrollment-guidance'

test('capture keeps video, instructions and controls visible without scrolling and Escape releases resources', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, args: cameraArgs })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await instrumentCamera(page)
    await fakeTracker(page, { faceCount: 2 })
    await openEnrollment(page)
    await consent(page)
    await page.getByRole('button', { name: 'Bắt đầu thu 5 góc', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Thu 5 góc khuôn mặt', exact: true })
    await dialog.waitFor()
    await dialog.getByText('Chỉ một người đứng trước camera.', { exact: true }).waitFor()
    assert.equal(await page.locator('video').count(), 1, 'the same video node owns the camera throughout the session')
    assert.equal(await page.locator('video').evaluate(video => video.playsInline && video.muted && video.disablePictureInPicture && video.disableRemotePlayback && !video.controls), true)
    await mkdir(screenshots, { recursive: true })
    for (const [width, height] of [[1440, 1000], [390, 844], [375, 667], [320, 568], [768, 1024], [667, 375]]) {
      await page.setViewportSize({ width, height })
      for (const selector of ['.capture-stop', '.capture-direction', '.enrollment-camera', '.capture-instruction', '.capture-steps']) {
        const bounds = await dialog.locator(selector).boundingBox()
        assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${selector} outside ${width}x${height}: ${JSON.stringify(bounds)}`)
      }
      assert.ok((await dialog.locator('.enrollment-camera').boundingBox()).height >= 100, 'video remains usable')
      assert.equal(await dialog.evaluate(element => element.scrollHeight <= element.clientHeight), true, `dialog scrolls at ${width}x${height}`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: `${screenshots}/${width}x${height}.png`, fullPage: true, animations: 'disabled' })
    }
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Tab')
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'focus stays in the capture session')
    }
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.textContent === 'Bắt đầu thu 5 góc')
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null)
    assert.equal(await page.evaluate(() => window.cameraStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true)
    assert.equal(await page.evaluate(() => window.trackerCount === window.trackerTerminated), true)
    assert.equal(await page.evaluate(() => document.body.classList.contains('cds--body--with-modal-open')), false)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})

test('all five directions stay at the camera, validation advances one pose and closing preserves accepted photos', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, args: cameraArgs })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await instrumentCamera(page)
    await fakeTracker(page)
    await page.addInitScript(() => {
      window.holdGuidance = true
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        postMessage(data, ...args) {
          if (data.type === 'frame') data.holdGuidance = window.holdGuidance
          return super.postMessage(data, ...args)
        }
      }
    })
    await page.route('**/src/enrollment/vision.worker.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      self.onmessage=({data})=>{
        if(data.type==='init'){postMessage({type:'ready',id:data.id});return;}
        data.bitmap?.close();
        const orientation=[{yaw:0,pitch:0,roll:0},{yaw:22,pitch:0,roll:0},{yaw:-22,pitch:0,roll:0},{yaw:0,pitch:-13,roll:0},{yaw:0,pitch:13,roll:0}][Math.max(0,data.fixturePose)];
        postMessage({type:'frame',id:data.id,frame:{faceCount:data.holdGuidance?2:1,orientation,issue:null,score:150,brightness:130,sharpness:150}});
      };` }))
    await openEnrollment(page)
    await consent(page)
    const accepted = []
    await page.route('**/api/enrollment/validate', route => {
      const body = route.request().postDataBuffer().toString()
      const pose = body.match(/name="pose"\r\n\r\n([a-z]+)/)?.[1]
      accepted.push(pose)
      return route.fulfill({ json: { valid: true, pose, reference_checked: body.includes('name="reference"'), quality: null } })
    })
    await page.getByRole('button', { name: 'Bắt đầu thu 5 góc', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    const poses = [
      ['front', 'Nhìn thẳng vào camera và giữ yên.'],
      ['left', 'Quay mặt nhẹ sang trái của bạn.'],
      ['right', 'Quay mặt nhẹ sang phải của bạn.'],
      ['up', 'Ngẩng cằm lên một chút.'],
      ['down', 'Hạ cằm xuống một chút.'],
    ]
    for (const [index, [pose, instruction]] of poses.entries()) {
      await page.locator(`.capture-stage[data-pose="${pose}"]`).waitFor()
      await page.getByRole('dialog').getByText('Chỉ một người đứng trước camera.', { exact: true }).waitFor()
      assert.equal(await page.locator('.capture-direction strong').innerText(), instruction)
      assert.equal(await page.locator('.capture-steps li.complete').count(), index)
      await mkdir(screenshots, { recursive: true })
      await page.screenshot({ path: `${screenshots}/pose-${pose}.png`, fullPage: true, animations: 'disabled' })
      await page.evaluate(() => { window.holdGuidance = false })
      await page.waitForFunction(count => document.querySelectorAll('.capture-steps li.complete').length === count, index + 1)
      await page.evaluate(() => { window.holdGuidance = true })
    }
    await page.locator('.auto-capture[data-capture-state="review"]').waitFor()
    assert.deepEqual(accepted, ['front', 'left', 'right', 'up', 'down'])
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.locator('.pose-card img').count(), 5)
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null)
    const kept = await page.locator('.pose-card img').evaluateAll(images => images.map(image => image.src))
    await page.getByRole('button', { name: 'Chụp lại góc Quay trái', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').getByText('Chỉ một người đứng trước camera.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Dừng thu', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.deepEqual(await page.locator('.pose-card img').evaluateAll(images => images.map(image => image.src)), kept)
    assert.equal(await page.evaluate(() => window.cameraStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true)
  } finally { await browser.close() }
})
