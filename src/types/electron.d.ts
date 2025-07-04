import { ProblemStatementData } from './solutions'

export interface SolutionResult {
  solution: {
    code: string
    thoughts: string[]
    time_complexity: string
    space_complexity: string
  }
}

export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }> // fails for invalid paths
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: SolutionResult) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: ProblemStatementData) => void) => () => void
  onSolutionSuccess: (callback: (data: SolutionResult) => void) => () => void
  onSolutionToken: (callback: (token: string) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  // Capture a screenshot and return its file path and preview data
  takeScreenshot: () => Promise<{ path: string; preview: string }>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (
    path: string
  ) => Promise<{ text: string; timestamp: number }> // only allowed screenshot paths
  analyzeImageFile: (
    path: string
  ) => Promise<{ text: string; timestamp: number }> // only allowed screenshot paths
  quitApp: () => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
