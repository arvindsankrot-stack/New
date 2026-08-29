import Foundation

enum APIError: Error, LocalizedError {
    case server(String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .badResponse: return "Unexpected response from server"
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    /// Points at the Hermes agent-pool server. Change to your deployed host,
    /// or leave as localhost when running the server on the same Mac as the simulator.
    var baseURL = URL(string: "http://localhost:3000")!

    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    func chat(messages: [ChatMessage]) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = messages.map { ["role": $0.role.rawValue, "content": $0.content] }
        request.httpBody = try JSONSerialization.data(withJSONObject: ["messages": payload])

        let (data, response) = try await session.data(for: request)
        try Self.checkResponse(response, data: data)

        struct ChatReply: Codable { let reply: String }
        return try decoder.decode(ChatReply.self, from: data).reply
    }

    func submitTask(type: TaskType, prompt: String) async throws -> AgentTask {
        var request = URLRequest(url: baseURL.appendingPathComponent("tasks"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "type": type.rawValue,
            "prompt": prompt,
        ])

        let (data, response) = try await session.data(for: request)
        try Self.checkResponse(response, data: data)
        return try decoder.decode(AgentTask.self, from: data)
    }

    func fetchTasks() async throws -> [AgentTask] {
        let (data, response) = try await session.data(from: baseURL.appendingPathComponent("tasks"))
        try Self.checkResponse(response, data: data)
        return try decoder.decode([AgentTask].self, from: data)
    }

    private static func checkResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = obj["error"] as? String {
                throw APIError.server(message)
            }
            throw APIError.server("HTTP \(http.statusCode)")
        }
    }
}
