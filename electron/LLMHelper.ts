import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import { app } from "electron"
import fs from "fs"
import path from "node:path"

export class LLMHelper {
  private model: GenerativeModel
  private readonly systemPrompt = `You are Wingman AI, a helpful, proactive assistant for any kind of problem or situation (not just coding). For any user input, analyze the situation, provide a clear problem statement, relevant context, and suggest several possible responses or actions the user could take next. Always explain your reasoning. Present your suggestions as a list of options or next steps.`

  private readonly screenshotDir = path.join(app.getPath("userData"), "screenshots")
  private readonly extraScreenshotDir = path.join(
    app.getPath("userData"),
    "extra_screenshots"
  )

  private async withAbortSignal<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const abortAny = (AbortSignal as unknown as {
        any(signals: AbortSignal[]): AbortSignal
      }).any
      const combined = init.signal ? abortAny([init.signal, signal]) : signal
      return originalFetch(input, { ...init, signal: combined })
    }
    try {
      return await fn()
    } finally {
      globalThis.fetch = originalFetch
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

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
  }

  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: "image/png"
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    // Remove any leading/trailing whitespace
    text = text.trim();
    return text;
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(
    problemInfo: any,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      const hasStream = typeof (this.model as unknown as { generateContentStream?: (p: string) => any }).generateContentStream === 'function'
      if (hasStream) {
        const streamResult = await (this.model as unknown as { generateContentStream: (p: string) => any }).generateContentStream(prompt)
        let aggregated = ""
        for await (const chunk of streamResult.stream) {
          const part = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ""
          if (part) {
            aggregated += part
            onToken?.(part)
          }
        }
        const finalResponse = await streamResult.response
        const text = this.cleanJsonResponse(finalResponse.text())
        const parsed = JSON.parse(text)
        console.log("[LLMHelper] Parsed LLM response:", parsed)
        return parsed
      } else {
        const result = await this.model.generateContent(prompt)
        console.log("[LLMHelper] Gemini LLM returned result.");
        const response = await result.response
        const text = this.cleanJsonResponse(response.text())
        const parsed = JSON.parse(text)
        console.log("[LLMHelper] Parsed LLM response:", parsed)
        return parsed
      }
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(
    problemInfo: any,
    currentCode: string,
    debugImagePaths: string[],
    signal?: AbortSignal
  ) {
    const exec = async () => {
      try {
        const imageParts = await Promise.all(
          debugImagePaths.map((path) => this.fileToGenerativePart(path))
        )

        const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(
          problemInfo,
          null,
          2
        )}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{\n  "solution": {\n    "code": "The code or main answer here.",\n    "problem_statement": "Restate the problem or situation.",\n    "context": "Relevant background/context.",\n    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n    "reasoning": "Explanation of why these suggestions are appropriate."\n  }\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

        const result = await this.model.generateContent([prompt, ...imageParts])
        const response = await result.response
        const text = this.cleanJsonResponse(response.text())
        const parsed = JSON.parse(text)
        console.log("[LLMHelper] Parsed debug LLM response:", parsed)
        return parsed
      } catch (error) {
        console.error("Error debugging solution with images:", error)
        throw error
      }
    }

    return signal ? this.withAbortSignal(signal, exec) : exec()
  }

  public async analyzeAudioFile(audioPath: string, signal?: AbortSignal) {
    try {
      const resolved = this.validatePath(audioPath)
      const audioData = await fs.promises.readFile(resolved);
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: "audio/mp3"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user.`;
      const exec = async () => {
        const result = await this.model.generateContent([prompt, audioPart])
        const response = await result.response
        const text = response.text()
        return { text, timestamp: Date.now() }
      }
      return signal ? this.withAbortSignal(signal, exec) : await exec()
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(
    data: string,
    mimeType: string,
    signal?: AbortSignal
  ) {
    try {
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user and be concise.`;
      const exec = async () => {
        const result = await this.model.generateContent([prompt, audioPart])
        const response = await result.response
        const text = response.text()
        return { text, timestamp: Date.now() }
      }
      return signal ? this.withAbortSignal(signal, exec) : await exec()
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string, signal?: AbortSignal) {
    try {
      const resolved = this.validatePath(imagePath)
      const imageData = await fs.promises.readFile(resolved);
      const imagePart = {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: "image/png"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
      const exec = async () => {
        const result = await this.model.generateContent([prompt, imagePart])
        const response = await result.response
        const text = response.text()
        return { text, timestamp: Date.now() }
      }
      return signal ? this.withAbortSignal(signal, exec) : await exec()
    } catch (error) {
      console.error("Error analyzing image file:", error);
      throw error;
    }
  }
} 