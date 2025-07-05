// ScreenshotHelper.ts

import { app } from "electron"
import fs from "node:fs"
import path from "node:path"
import screenshot from "screenshot-desktop"
import { v4 as uuidv4 } from "uuid"

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  private view: "queue" | "solutions" = "queue"

  constructor(view: "queue" | "solutions" = "queue") {
    this.view = view

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir)
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir)
    }
  }

  private isPathInsideDir(filePath: string, dir: string): boolean {
    const relative = path.relative(dir, filePath)
    return !relative.startsWith("..") && !path.isAbsolute(relative)
  }

  private validatePath(filePath: string): string {
    const resolved = path.resolve(filePath)
    if (
      !this.isPathInsideDir(resolved, this.screenshotDir) &&
      !this.isPathInsideDir(resolved, this.extraScreenshotDir)
    ) {
      throw new Error("Path outside allowed directories")
    }
    return resolved
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string> {
    hideMainWindow()
    let screenshotPath = ""

    if (this.view === "queue") {
      screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
      await screenshot({ filename: screenshotPath })

      this.screenshotQueue.push(screenshotPath)
      if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
        const removedPath = this.screenshotQueue.shift()
        if (removedPath) {
          try {
            await fs.promises.unlink(removedPath)
          } catch (error: unknown) {
            console.error("Error removing old screenshot:", error)
          }
        }
      }
    } else {
      screenshotPath = path.join(this.extraScreenshotDir, `${uuidv4()}.png`)
      await screenshot({ filename: screenshotPath })

      this.extraScreenshotQueue.push(screenshotPath)
      if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
        const removedPath = this.extraScreenshotQueue.shift()
        if (removedPath) {
          try {
            await fs.promises.unlink(removedPath)
          } catch (error: unknown) {
            console.error("Error removing old screenshot:", error)
          }
        }
      }
    }

    showMainWindow()
    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      const resolved = this.validatePath(filepath)
      const data = await fs.promises.readFile(resolved)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error: unknown) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolved = this.validatePath(path)
      await fs.promises.unlink(resolved)
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== resolved
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== resolved
        )
      }
      return { success: true }
    } catch (error: unknown) {
      console.error("Error deleting file:", error)
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'Unknown error' }
    }
  }
}
