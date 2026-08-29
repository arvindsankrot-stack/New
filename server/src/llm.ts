import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
