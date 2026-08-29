import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// The Gemini SDK's error messages often carry a long embedded JSON blob.
// Keep only the first line and cap the length so errors shown to users stay readable.
export function cleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

export async function runCompletion(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(last.content);
  return result.response.text();
}
