// ipcHandlers.ts

import { ipcMain, app } from "electron"
import path from "node:path"

import { AppState } from "./main"

const screenshotDir = path.join(app.getPath("userData"), "screenshots")
const extraScreenshotDir = path.join(app.getPath("userData"), "extra_screenshots")

const isPathInsideDir = (filePath: string, dir: string): boolean => {
  const relative = path.relative(dir, filePath)
  return !relative.startsWith("..") && !path.isAbsolute(relative)
}

const validatePath = (filePath: string): string => {
  const resolved = path.resolve(filePath)
  if (!isPathInsideDir(resolved, screenshotDir) && !isPathInsideDir(resolved, extraScreenshotDir)) {
    throw new Error("Invalid path")
  }
  return resolved
}

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, filePath: string) => {
    try {
      const resolved = validatePath(filePath)
      return await appState.deleteScreenshot(resolved)
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'Unknown error' }
    }
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error: unknown) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview) => console.log(preview.path))
      return previews
    } catch (error: unknown) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: unknown) {
      console.error("Error resetting queues:", error)
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'Unknown error' }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: unknown) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, filePath: string) => {
    try {
      const resolved = validatePath(filePath)
      const result = await appState.processingHelper.processAudioFile(resolved)
      return result
    } catch (error: unknown) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, filePath: string) => {
    try {
      const resolved = validatePath(filePath)
      const result = await appState.processingHelper
        .getLLMHelper()
        .analyzeImageFile(resolved)
      return result
    } catch (error: unknown) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("quit-app", () => {
    app.quit()
  })
}
